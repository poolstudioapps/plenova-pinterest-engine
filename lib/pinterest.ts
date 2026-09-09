import "server-only";
import {
  config,
  hasManualPinterestToken,
  isPinterestConfigured,
  manualTokenCanPublish,
  resolveRedirectUri,
} from "@/lib/config";
import { notConfigured, notConnected, rateLimited, upstream } from "@/lib/errors";
import { getStore } from "@/lib/store";
import type {
  PinterestAccount,
  PinterestBoard,
  PinterestConnection,
} from "@/lib/types";

/**
 * Pinterest service abstraction (spec §13-§15, §33).
 *
 * VERIFIED against the official OAuth documentation (2026-09):
 *   - authorize: https://www.pinterest.com/oauth/ with client_id, redirect_uri,
 *     response_type=code, comma-separated scope, state
 *   - token:     POST /v5/oauth/token, HTTP Basic client_id:client_secret,
 *                form-encoded grant_type/code/redirect_uri
 *
 * TO RE-VERIFY once the developer app is approved: the /v5/pins request body.
 * The endpoint reference sits behind a login wall, so the media_source shape
 * below follows the documented v5 contract but has not been exercised against
 * a live token. `publishPin` is the only place that needs revisiting.
 */

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------- OAuth ---

export function buildAuthorizeUrl(state: string): string {
  if (!isPinterestConfigured()) {
    throw notConfigured(
      "Pinterest is not configured. Set PINTEREST_APP_ID, PINTEREST_APP_SECRET and the redirect URI.",
    );
  }
  const url = new URL(config.pinterest.authorizeUrl);
  url.searchParams.set("client_id", config.pinterest.appId!);
  url.searchParams.set("redirect_uri", resolveRedirectUri()!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.pinterest.scopes.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

function basicAuthHeader(): string {
  const raw = `${config.pinterest.appId}:${config.pinterest.appSecret}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
}

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(`${config.pinterest.apiBase}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    // Never echo the raw body: it can contain the submitted code.
    throw upstream(`Pinterest rejected the token request (HTTP ${res.status}).`, {
      hint: safeHint(text),
    });
  }

  try {
    return JSON.parse(text) as TokenResponse;
  } catch {
    throw upstream("Pinterest returned a malformed token response.");
  }
}

/** Extracts only the safe `message`/`error` field from an upstream error body. */
function safeHint(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const value = parsed.message ?? parsed.error_description ?? parsed.error;
    return typeof value === "string" ? value.slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

function toConnection(
  token: TokenResponse,
  previous?: PinterestConnection | null,
): PinterestConnection {
  const now = Date.now();
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? previous?.refreshToken ?? null,
    expiresAt: token.expires_in ? now + token.expires_in * 1000 : null,
    refreshTokenExpiresAt: token.refresh_token_expires_in
      ? now + token.refresh_token_expires_in * 1000
      : (previous?.refreshTokenExpiresAt ?? null),
    scopes: token.scope
      ? token.scope.split(/[,\s]+/).filter(Boolean)
      : [...config.pinterest.scopes],
    account: previous?.account ?? null,
    connectedAt: previous?.connectedAt ?? new Date().toISOString(),
  };
}

/** Exchanges the authorization code and persists the connection. */
export async function exchangeCodeForToken(
  code: string,
): Promise<PinterestConnection> {
  if (!isPinterestConfigured()) {
    throw notConfigured("Pinterest is not configured.");
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: resolveRedirectUri()!,
  });

  const token = await requestToken(body);
  let connection = toConnection(token);

  // Attach the account label so the UI can show who is connected.
  try {
    connection = { ...connection, account: await fetchAccount(connection) };
  } catch {
    // A missing profile must not break an otherwise valid connection.
  }

  await getStore().setConnection(connection);
  return connection;
}

async function refreshConnection(
  connection: PinterestConnection,
): Promise<PinterestConnection> {
  if (!connection.refreshToken) {
    throw notConnected(
      "The Pinterest access token expired and no refresh token is stored. Reconnect the account.",
    );
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: connection.refreshToken,
  });

  const token = await requestToken(body);
  const refreshed = toConnection(token, connection);
  await getStore().setConnection(refreshed);
  return refreshed;
}

/** Synthesises a connection from a manually supplied token. */
function manualConnection(): PinterestConnection {
  return {
    accessToken: config.pinterest.accessToken!,
    refreshToken: null,
    expiresAt: null,
    refreshTokenExpiresAt: null,
    scopes: config.pinterest.tokenScopes,
    account: null,
    connectedAt: new Date(0).toISOString(),
  };
}

/**
 * Returns a connection with a live access token, refreshing proactively when
 * it is within the expiry margin.
 */
async function activeConnection(): Promise<PinterestConnection> {
  const store = getStore();
  const connection = await store.getConnection();

  if (!connection) {
    // Fall back to a manually supplied token while the app awaits approval.
    if (hasManualPinterestToken()) return manualConnection();
    throw notConnected("No Pinterest account is connected.");
  }
  if (
    connection.expiresAt !== null &&
    connection.expiresAt - TOKEN_REFRESH_MARGIN_MS <= Date.now()
  ) {
    return refreshConnection(connection);
  }
  return connection;
}

export async function disconnect(): Promise<void> {
  await getStore().setConnection(null);
}

export interface ConnectionStatus {
  configured: boolean;
  connected: boolean;
  /** How the engine is authenticated: full OAuth, a manual token, or not. */
  mode: "oauth" | "manual" | "none";
  /** False for read-only trial tokens, which lack pins:write. */
  canWrite: boolean;
  account: PinterestAccount | null;
  scopes: string[];
  expiresAt: string | null;
  connectedAt: string | null;
}

/** Never returns tokens - this feeds a client component. */
export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const configured = isPinterestConfigured();
  const stored = await getStore().getConnection();

  if (stored) {
    return {
      configured,
      connected: true,
      mode: "oauth",
      canWrite: stored.scopes.includes("pins:write"),
      account: stored.account,
      scopes: stored.scopes,
      expiresAt: stored.expiresAt
        ? new Date(stored.expiresAt).toISOString()
        : null,
      connectedAt: stored.connectedAt,
    };
  }

  if (hasManualPinterestToken()) {
    return {
      configured,
      connected: true,
      mode: "manual",
      canWrite: manualTokenCanPublish(),
      account: null,
      scopes: config.pinterest.tokenScopes,
      expiresAt: null,
      connectedAt: null,
    };
  }

  return {
    configured,
    connected: false,
    mode: "none",
    canWrite: false,
    account: null,
    scopes: [],
    expiresAt: null,
    connectedAt: null,
  };
}

// ------------------------------------------------------------ API calls ---

async function apiFetch<T>(
  path: string,
  init: RequestInit & { accessToken: string },
): Promise<T> {
  const { accessToken, ...rest } = init;
  const res = await fetch(`${config.pinterest.apiBase}${path}`, {
    ...rest,
    headers: {
      ...(rest.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (res.status === 429) {
    throw rateLimited(
      "Pinterest rate limit reached. Wait before publishing again.",
    );
  }

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) {
      throw notConnected(
        "Pinterest rejected the access token. Reconnect the account.",
      );
    }
    throw upstream(`Pinterest API error (HTTP ${res.status}).`, {
      hint: safeHint(text),
    });
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw upstream("Pinterest returned a malformed response.");
  }
}

interface RawAccount {
  username?: string;
  account_type?: string;
  profile_image?: string;
}

async function fetchAccount(
  connection: PinterestConnection,
): Promise<PinterestAccount> {
  const raw = await apiFetch<RawAccount>("/user_account", {
    method: "GET",
    accessToken: connection.accessToken,
  });
  return {
    username: raw.username ?? "unknown",
    accountType: raw.account_type,
    profileImage: raw.profile_image,
  };
}

interface RawBoardsResponse {
  items?: Array<{
    id: string;
    name: string;
    privacy?: string;
    pin_count?: number;
  }>;
  bookmark?: string | null;
}

/** Retrieves every board, following pagination bookmarks (spec §14). */
export async function listBoards(): Promise<PinterestBoard[]> {
  const connection = await activeConnection();
  const boards: PinterestBoard[] = [];
  let bookmark: string | null | undefined;
  let guard = 0;

  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (bookmark) query.set("bookmark", bookmark);

    const page = await apiFetch<RawBoardsResponse>(`/boards?${query}`, {
      method: "GET",
      accessToken: connection.accessToken,
    });

    for (const item of page.items ?? []) {
      boards.push({
        id: item.id,
        name: item.name,
        privacy: item.privacy,
        pinCount: item.pin_count,
      });
    }
    bookmark = page.bookmark;
  } while (bookmark && ++guard < 20);

  return boards.sort((a, b) => a.name.localeCompare(b.name));
}

export interface PublishPinInput {
  boardId: string;
  title: string;
  description: string;
  imageUrl: string;
  link: string;
  altText?: string;
}

export interface PublishPinResult {
  pinterestPinId: string;
}

/**
 * Creates a Pin.
 *
 * Only returns success when Pinterest confirms it with a Pin id (spec §15:
 * never claim a Pin was published unless Pinterest says so).
 */
export async function publishPin(
  input: PublishPinInput,
): Promise<PublishPinResult> {
  if (input.imageUrl.startsWith("data:")) {
    throw upstream(
      "This Pin's image is stored inline. Attach a Blob store so Pinterest can fetch a public image URL.",
    );
  }

  const connection = await activeConnection();

  if (connection.scopes.length > 0 && !connection.scopes.includes("pins:write")) {
    throw notConnected(
      "The current Pinterest token is read-only (no pins:write scope). Publishing needs an approved app with write access.",
    );
  }

  const response = await apiFetch<{ id?: string }>("/pins", {
    method: "POST",
    accessToken: connection.accessToken,
    body: JSON.stringify({
      board_id: input.boardId,
      title: input.title,
      description: input.description,
      link: input.link,
      alt_text: input.altText,
      media_source: {
        source_type: "image_url",
        url: input.imageUrl,
      },
    }),
  });

  if (!response.id) {
    throw upstream("Pinterest accepted the request but returned no Pin id.");
  }
  return { pinterestPinId: response.id };
}
