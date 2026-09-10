import "server-only";
import { createHash, randomBytes } from "node:crypto";
import {
  config,
  isTikTokConfigured,
  resolveTikTokRedirectUri,
} from "@/lib/config";
import { badRequest, notConfigured, notConnected, rateLimited, upstream } from "@/lib/errors";
import { getStore } from "@/lib/store";
import type { TikTokConnection, TikTokCreatorInfo } from "@/lib/types";

/**
 * TikTok Content Posting API.
 *
 * Ported from a working implementation, so the two quirks that cost the most
 * time are preserved deliberately:
 *
 *  1. PKCE `code_challenge` is the HEX digest of SHA256(verifier), NOT
 *     base64url as in essentially every other OAuth 2.0 implementation. Get
 *     this wrong and TikTok fails with no useful message.
 *  2. Photo carousels cannot use FILE_UPLOAD - that is video only. They must
 *     use PULL_FROM_URL, which is why the image domain has to be verified
 *     under URL properties on the developer app.
 */

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------- OAuth ---

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** TikTok expects the HEX digest, not base64url. See the note above. */
export function createPkcePair(): PkcePair {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("hex");
  return { verifier, challenge };
}

export function buildAuthorizeUrl(state: string, challenge: string): string {
  if (!isTikTokConfigured()) {
    throw notConfigured(
      "TikTok is not configured. Set TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET and the redirect URI.",
    );
  }
  const url = new URL(config.tiktok.authorizeUrl);
  url.searchParams.set("client_key", config.tiktok.clientKey!);
  url.searchParams.set("scope", config.tiktok.scopes.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", resolveTikTokRedirectUri()!);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  open_id?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(`${config.tiktok.apiBase}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const text = await res.text();
  let parsed: TokenResponse;
  try {
    parsed = JSON.parse(text) as TokenResponse;
  } catch {
    throw upstream("TikTok returned a malformed token response.");
  }

  // TikTok answers 200 with an error body rather than an HTTP error code.
  if (!res.ok || parsed.error || !parsed.access_token) {
    throw upstream("TikTok rejected the token request.", {
      hint: parsed.error_description ?? parsed.error ?? `HTTP ${res.status}`,
    });
  }
  return parsed;
}

function toConnection(
  token: TokenResponse,
  previous?: TikTokConnection | null,
): TikTokConnection {
  const now = Date.now();
  return {
    accessToken: token.access_token!,
    refreshToken: token.refresh_token ?? previous?.refreshToken ?? null,
    expiresAt: token.expires_in ? now + token.expires_in * 1000 : null,
    refreshTokenExpiresAt: token.refresh_expires_in
      ? now + token.refresh_expires_in * 1000
      : (previous?.refreshTokenExpiresAt ?? null),
    scopes: token.scope
      ? token.scope.split(/[,\s]+/).filter(Boolean)
      : [...config.tiktok.scopes],
    openId: token.open_id ?? previous?.openId ?? "",
    username: previous?.username ?? "",
    displayName: previous?.displayName ?? "",
    avatarUrl: previous?.avatarUrl ?? null,
    connectedAt: previous?.connectedAt ?? new Date().toISOString(),
  };
}

export async function exchangeCodeForToken(
  code: string,
  verifier: string,
): Promise<TikTokConnection> {
  if (!isTikTokConfigured()) throw notConfigured("TikTok is not configured.");

  const token = await requestToken(
    new URLSearchParams({
      client_key: config.tiktok.clientKey!,
      client_secret: config.tiktok.clientSecret!,
      code,
      grant_type: "authorization_code",
      redirect_uri: resolveTikTokRedirectUri()!,
      code_verifier: verifier,
    }),
  );

  let connection = toConnection(token);
  try {
    connection = { ...connection, ...(await fetchProfile(connection)) };
  } catch {
    // A missing profile must not break an otherwise valid connection.
  }

  await getStore().setTikTokConnection(connection);
  return connection;
}

async function refreshConnection(
  connection: TikTokConnection,
): Promise<TikTokConnection> {
  if (!connection.refreshToken) {
    throw notConnected(
      "The TikTok token expired and no refresh token is stored. Reconnect the account.",
    );
  }
  const token = await requestToken(
    new URLSearchParams({
      client_key: config.tiktok.clientKey!,
      client_secret: config.tiktok.clientSecret!,
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
    }),
  );
  const refreshed = toConnection(token, connection);
  await getStore().setTikTokConnection(refreshed);
  return refreshed;
}

async function activeConnection(): Promise<TikTokConnection> {
  const connection = await getStore().getTikTokConnection();
  if (!connection) throw notConnected("No TikTok account is connected.");

  if (
    connection.expiresAt !== null &&
    connection.expiresAt - TOKEN_REFRESH_MARGIN_MS <= Date.now()
  ) {
    return refreshConnection(connection);
  }
  return connection;
}

export async function disconnect(): Promise<void> {
  await getStore().setTikTokConnection(null);
}

// ------------------------------------------------------------ API calls ---

async function apiCall<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${config.tiktok.apiBase}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    cache: "no-store",
  });

  if (res.status === 429) {
    throw rateLimited("TikTok rate limit reached. Wait before publishing again.");
  }

  const text = await res.text();
  let parsed: { error?: { code?: string; message?: string }; data?: unknown };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw upstream(`TikTok returned a malformed response (HTTP ${res.status}).`);
  }

  if (res.status === 401) {
    throw notConnected("TikTok rejected the access token. Reconnect the account.");
  }
  // TikTok signals success with error.code === "ok".
  if (!res.ok || (parsed.error?.code && parsed.error.code !== "ok")) {
    throw upstream("TikTok API error.", {
      hint: parsed.error?.message ?? parsed.error?.code ?? `HTTP ${res.status}`,
    });
  }
  return parsed as T;
}

interface RawProfile {
  data?: { user?: { open_id?: string; union_id?: string; display_name?: string; avatar_url?: string; username?: string } };
}

async function fetchProfile(
  connection: TikTokConnection,
): Promise<Partial<TikTokConnection>> {
  const fields = "open_id,display_name,avatar_url,username";
  const raw = await apiCall<RawProfile>(
    `/v2/user/info/?fields=${fields}`,
    connection.accessToken,
    { method: "GET" },
  );
  const user = raw.data?.user ?? {};
  return {
    openId: user.open_id ?? connection.openId,
    username: user.username ?? "",
    displayName: user.display_name ?? "",
    avatarUrl: user.avatar_url ?? null,
  };
}

interface RawCreatorInfo {
  data?: {
    creator_nickname?: string;
    creator_avatar_url?: string;
    privacy_level_options?: string[];
    comment_disabled?: boolean;
    duet_disabled?: boolean;
    stitch_disabled?: boolean;
    max_video_post_duration_sec?: number;
  };
}

/**
 * Queried immediately before every direct post.
 *
 * TikTok audits this: the privacy options shown to the operator must come from
 * this live response, and their choice must be honoured. Hard-coding the list
 * is grounds for rejection.
 */
export async function getCreatorInfo(): Promise<TikTokCreatorInfo> {
  const connection = await activeConnection();
  const raw = await apiCall<RawCreatorInfo>(
    "/v2/post/publish/creator_info/query/",
    connection.accessToken,
    { method: "POST" },
  );
  const data = raw.data ?? {};
  return {
    nickname: data.creator_nickname ?? connection.displayName,
    avatarUrl: data.creator_avatar_url ?? connection.avatarUrl,
    privacyOptions: data.privacy_level_options ?? [],
    commentDisabled: Boolean(data.comment_disabled),
    duetDisabled: Boolean(data.duet_disabled),
    stitchDisabled: Boolean(data.stitch_disabled),
    maxTitleLength: 90,
    maxVideoDuration: data.max_video_post_duration_sec ?? 0,
  };
}

export interface PublishCarouselInput {
  title: string;
  description: string;
  imageUrls: string[];
  /** 1-indexed, as TikTok expects. */
  coverIndex: number;
  postMode: "DIRECT_POST" | "MEDIA_UPLOAD";
  /** Required for DIRECT_POST; must be one of the creator's live options. */
  privacyLevel?: string;
  brandContentToggle?: boolean;
  brandOrganicToggle?: boolean;
}

export interface PublishResult {
  publishId: string;
}

export async function publishCarousel(
  input: PublishCarouselInput,
): Promise<PublishResult> {
  if (input.imageUrls.length === 0) {
    throw badRequest("A carousel needs at least one image.");
  }
  const inline = input.imageUrls.find((u) => u.startsWith("data:"));
  if (inline) {
    throw badRequest(
      "One slide is stored inline. TikTok fetches images by URL, so every slide needs a public URL - attach a Blob store and regenerate.",
    );
  }

  // Input validation first: no point refreshing a token to reject the payload.
  if (input.postMode === "DIRECT_POST" && !input.privacyLevel) {
    throw badRequest(
      "A privacy level is required for a direct post, and must be one the creator actually offers.",
    );
  }

  const connection = await activeConnection();

  const needed = input.postMode === "DIRECT_POST" ? "video.publish" : "video.upload";
  if (connection.scopes.length > 0 && !connection.scopes.includes(needed)) {
    throw notConnected(
      `The connected TikTok account is missing the ${needed} scope. Reconnect and grant it.`,
    );
  }
  const postInfo: Record<string, unknown> = {
    title: input.title.slice(0, 90),
    description: input.description.slice(0, 4000),
  };
  if (input.postMode === "DIRECT_POST") {
    postInfo.privacy_level = input.privacyLevel;
    postInfo.brand_content_toggle = Boolean(input.brandContentToggle);
    postInfo.brand_organic_toggle = Boolean(input.brandOrganicToggle);
  }

  const body = {
    media_type: "PHOTO",
    post_mode: input.postMode,
    post_info: postInfo,
    source_info: {
      source: "PULL_FROM_URL",
      // 1-indexed on TikTok's side, and clamped so a bad value cannot 400.
      photo_cover_index: Math.min(
        Math.max(1, input.coverIndex),
        input.imageUrls.length,
      ),
      photo_images: input.imageUrls,
    },
  };

  const raw = await apiCall<{ data?: { publish_id?: string } }>(
    "/v2/post/publish/content/init/",
    connection.accessToken,
    { method: "POST", body: JSON.stringify(body) },
  );

  const publishId = raw.data?.publish_id;
  if (!publishId) {
    throw upstream("TikTok accepted the request but returned no publish id.");
  }
  return { publishId };
}

export async function getPublishStatus(
  publishId: string,
): Promise<{ status: string; failReason: string | null }> {
  const connection = await activeConnection();
  const raw = await apiCall<{
    data?: { status?: string; fail_reason?: string };
  }>("/v2/post/publish/status/fetch/", connection.accessToken, {
    method: "POST",
    body: JSON.stringify({ publish_id: publishId }),
  });
  return {
    status: raw.data?.status ?? "UNKNOWN",
    failReason: raw.data?.fail_reason ?? null,
  };
}

export interface TikTokStatus {
  configured: boolean;
  connected: boolean;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  scopes: string[];
  canDirectPost: boolean;
  canDraft: boolean;
  connectedAt: string | null;
  expiresAt: string | null;
}

/** Never returns tokens - this feeds a client component. */
export async function getStatus(): Promise<TikTokStatus> {
  const configured = isTikTokConfigured();
  const connection = await getStore().getTikTokConnection();

  return {
    configured,
    connected: Boolean(connection),
    username: connection?.username || null,
    displayName: connection?.displayName || null,
    avatarUrl: connection?.avatarUrl ?? null,
    scopes: connection?.scopes ?? [],
    canDirectPost: Boolean(connection?.scopes.includes("video.publish")),
    canDraft: Boolean(connection?.scopes.includes("video.upload")),
    connectedAt: connection?.connectedAt ?? null,
    expiresAt: connection?.expiresAt
      ? new Date(connection.expiresAt).toISOString()
      : null,
  };
}
