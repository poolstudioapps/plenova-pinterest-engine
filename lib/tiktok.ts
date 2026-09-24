import "server-only";
import { createHash, randomBytes } from "node:crypto";
import {
  config,
  isTikTokConfigured,
  resolveTikTokRedirectUri,
} from "@/lib/config";
import { badRequest, notConfigured, notConnected, rateLimited, upstream } from "@/lib/errors";
import { getStore } from "@/lib/store";
import type { TikTokAccount, TikTokCreatorInfo } from "@/lib/types";
import { DEFAULT_CONTENT_LOCALE, type ContentLocale } from "@/lib/i18n";

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
      "TikTok n'est pas configuré. Ajoute TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET et l'URI de redirection.",
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
    throw upstream("TikTok a renvoyé une réponse illisible pour le jeton. Relance la connexion.");
  }

  // TikTok answers 200 with an error body rather than an HTTP error code.
  if (!res.ok || parsed.error || !parsed.access_token) {
    throw upstream("TikTok a refusé la demande de jeton. Reconnecte le compte.", {
      hint: parsed.error_description ?? parsed.error ?? `HTTP ${res.status}`,
    });
  }
  return parsed;
}

function toAccount(
  token: TokenResponse,
  previous?: TikTokAccount | null,
): TikTokAccount {
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
    // Defaults to the primary language; the operator assigns the real one.
    language: previous?.language ?? (DEFAULT_CONTENT_LOCALE),
    connectedAt: previous?.connectedAt ?? new Date().toISOString(),
  };
}

/** Exchanges the code and files the account alongside the others. */
export async function exchangeCodeForToken(
  code: string,
  verifier: string,
): Promise<TikTokAccount> {
  if (!isTikTokConfigured()) throw notConfigured("TikTok n'est pas configuré.");

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

  let connection = toAccount(token);
  try {
    connection = { ...connection, ...(await fetchProfile(connection)) };
  } catch (err) {
    // A missing profile must not break an otherwise valid connection - the
    // tokens are what matter - but it must not pass unnoticed either. An
    // account with no name shows as a bare "@" and cannot be told apart from
    // the next one, which is the opposite of useful when several are
    // connected and each posts in its own language.
    console.warn(
      "[tiktok] connected but the profile could not be read:",
      err instanceof Error ? err.message : String(err),
    );
  }

  if (!connection.openId) {
    throw upstream("TikTok n'a pas renvoyé d'open id, le compte ne peut pas être enregistré. Relance la connexion.");
  }
  await getStore().saveTikTokAccount(connection);
  return connection;
}

async function refreshAccount(account: TikTokAccount): Promise<TikTokAccount> {
  const connection = account;
  if (!connection.refreshToken) {
    throw notConnected(
      "Le jeton TikTok a expiré et aucun jeton de rafraîchissement n'est stocké. Reconnecte le compte.",
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
  const refreshed = toAccount(token, connection);
  await getStore().saveTikTokAccount(refreshed);
  return refreshed;
}

/**
 * Returns one account with a live token, refreshing when it nears expiry.
 * Every caller names the account: with several connected there is no
 * "current" one.
 */
async function activeAccount(openId: string): Promise<TikTokAccount> {
  const account = await getStore().getTikTokAccount(openId);
  if (!account) throw notConnected(`Le compte TikTok ${openId} n'est pas connecté.`);

  if (
    account.expiresAt !== null &&
    account.expiresAt - TOKEN_REFRESH_MARGIN_MS <= Date.now()
  ) {
    return refreshAccount(account);
  }
  return account;
}

export async function disconnect(openId: string): Promise<void> {
  await getStore().deleteTikTokAccount(openId);
}

/** Assigns the language an account publishes in. */
export async function setAccountLanguage(
  openId: string,
  language: ContentLocale,
): Promise<TikTokAccount> {
  const account = await getStore().getTikTokAccount(openId);
  if (!account) throw notConnected(`Le compte TikTok ${openId} n'est pas connecté.`);
  const updated = { ...account, language };
  await getStore().saveTikTokAccount(updated);
  return updated;
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
    throw rateLimited("Limite de requêtes TikTok atteinte. Attends un moment avant de republier.");
  }

  const text = await res.text();
  let parsed: { error?: { code?: string; message?: string }; data?: unknown };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw upstream(`TikTok a renvoyé une réponse illisible (HTTP ${res.status}).`);
  }

  if (res.status === 401) {
    throw notConnected("TikTok a refusé le jeton d'accès. Reconnecte le compte.");
  }
  // TikTok signals success with error.code === "ok".
  if (!res.ok || (parsed.error?.code && parsed.error.code !== "ok")) {
    throw upstream("TikTok a renvoyé une erreur.", {
      code: parsed.error?.code ?? null,
      hint: parsed.error?.message ?? parsed.error?.code ?? `HTTP ${res.status}`,
    });
  }
  return parsed as T;
}

interface RawProfile {
  data?: { user?: { open_id?: string; union_id?: string; display_name?: string; avatar_url?: string; username?: string } };
}

/**
 * Fields are chosen from the scopes the account actually granted.
 *
 * TikTok's user-object table assigns every field a scope: open_id, avatar_url
 * and display_name come with user.info.basic, while username needs
 * user.info.profile. Asking for a field the token does not cover fails the
 * WHOLE call, which is why a connection ended up with no name and no avatar
 * rather than merely no handle.
 *
 * Adding user.info.profile to the requested scopes would bring the real
 * handle, but it has to be enabled on the TikTok app first, and asking for a
 * scope the app does not have breaks authorisation outright. So it is used
 * when present and not demanded.
 */
async function fetchProfile(
  connection: TikTokAccount,
): Promise<Partial<TikTokAccount>> {
  const fields = [
    "open_id",
    "display_name",
    "avatar_url",
    ...(connection.scopes.includes("user.info.profile") ? ["username"] : []),
  ].join(",");
  const raw = await apiCall<RawProfile>(
    `/v2/user/info/?fields=${fields}`,
    connection.accessToken,
    { method: "GET" },
  );
  const user = raw.data?.user ?? {};
  return {
    openId: user.open_id ?? connection.openId,
    // A handle already read under wider scopes is not erased by a later read
    // made under narrower ones.
    username: user.username ?? connection.username ?? "",
    displayName: user.display_name ?? "",
    avatarUrl: user.avatar_url ?? null,
    profileSyncedAt: new Date().toISOString(),
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
export async function getCreatorInfo(openId: string): Promise<TikTokCreatorInfo> {
  const connection = await activeAccount(openId);
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
  /** Which connected account publishes this. */
  openId: string;
  title: string;
  description: string;
  imageUrls: string[];
  /**
   * Which slide is the cover, counted from 1 the way the rest of the app
   * counts slides. TikTok counts from 0, and the conversion happens here.
   */
  coverIndex: number;
  postMode: "DIRECT_POST" | "MEDIA_UPLOAD";
  /** Required for DIRECT_POST; must be one of the creator's live options. */
  privacyLevel?: string;
  brandContentToggle?: boolean;
  brandOrganicToggle?: boolean;
  allowComment?: boolean;
  /** Every slide here is painted by an image model, so this is normally true. */
  isAigc?: boolean;
}

export interface PublishResult {
  publishId: string;
}

export async function publishCarousel(
  input: PublishCarouselInput,
): Promise<PublishResult> {
  if (input.imageUrls.length === 0) {
    throw badRequest("Un carrousel a besoin d'au moins une image.");
  }
  const inline = input.imageUrls.find((u) => u.startsWith("data:"));
  if (inline) {
    throw badRequest(
      "Une slide est stockée en data URL. TikTok va chercher les images par URL, chaque slide a donc besoin d'une URL publique - branche un Blob store et relance la génération.",
    );
  }

  // Input validation first: no point refreshing a token to reject the payload.
  if (input.postMode === "DIRECT_POST" && !input.privacyLevel) {
    throw badRequest(
      "Une publication directe a besoin d'un niveau de confidentialité, choisi parmi ceux que le compte propose vraiment.",
    );
  }

  const connection = await activeAccount(input.openId);

  const needed = input.postMode === "DIRECT_POST" ? "video.publish" : "video.upload";
  if (connection.scopes.length > 0 && !connection.scopes.includes(needed)) {
    throw notConnected(
      `Le compte TikTok connecté n'a pas le scope ${needed}. Reconnecte-le en accordant ce scope.`,
    );
  }
  const postInfo: Record<string, unknown> = {
    title: input.title.slice(0, 90),
    description: input.description.slice(0, 4000),
  };
  if (input.postMode === "DIRECT_POST") {
    // TikTok forbids the pair, and the UI disables it - but the server must
    // not be able to emit it either.
    if (input.brandContentToggle && input.privacyLevel === "SELF_ONLY") {
      throw badRequest(
        "Un contenu de marque ne peut pas être publié en « Moi uniquement ».",
      );
    }
    postInfo.privacy_level = input.privacyLevel;
    postInfo.brand_content_toggle = Boolean(input.brandContentToggle);
    postInfo.brand_organic_toggle = Boolean(input.brandOrganicToggle);
    // TikTok's guidelines require comments to be off unless the operator asks
    // for them, so the flag is sent inverted and defaults to disabled.
    postInfo.disable_comment = !input.allowComment;
  }

  const body = {
    media_type: "PHOTO",
    post_mode: input.postMode,
    // A sibling of post_info, not a field inside it. Every slide is painted by
    // an image model, so declaring it is simply accurate.
    is_aigc: input.isAigc ?? true,
    post_info: postInfo,
    source_info: {
      source: "PULL_FROM_URL",
      // "Indicates the index (starting from 0) of the photo to be used as the
      // cover" - so slide 1 is index 0. Sending the slide number directly made
      // the second slide the cover every time, and made the hook unreachable.
      photo_cover_index: Math.min(
        Math.max(0, input.coverIndex - 1),
        Math.max(0, input.imageUrls.length - 1),
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
    throw upstream("TikTok a accepté la demande mais n'a renvoyé aucun publish id.");
  }
  return { publishId };
}

export async function getPublishStatus(
  openId: string,
  publishId: string,
): Promise<{ status: string; failReason: string | null }> {
  const connection = await activeAccount(openId);
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

/** One account as the dashboard sees it. Never carries a token. */
export interface TikTokAccountView {
  openId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  language: ContentLocale;
  scopes: string[];
  canDirectPost: boolean;
  canDraft: boolean;
  connectedAt: string;
  expiresAt: string | null;
}

export interface TikTokStatus {
  configured: boolean;
  accounts: TikTokAccountView[];
}

/** Never returns tokens - this feeds a client component. */
/** Accounts whose profile this process has already tried to read. */
const profileAttempted = new Set<string>();

export async function getStatus(): Promise<TikTokStatus> {
  const store = getStore();
  let accounts = await store.listTikTokAccounts();

  /**
   * Repair a name that was never read, once.
   *
   * An account whose profile call failed while connecting has no username,
   * and a placeholder is only a label - the real handle is what tells two
   * accounts apart when each posts in its own language. This asks again, and
   * only while a name is genuinely missing, so it costs nothing thereafter.
   */
  // Never read, or read before the handle scope was granted. Attempted at
  // most once per account per process, so a profile call that keeps failing
  // cannot add a round trip to every single page load.
  const nameless = accounts.filter(
    (a) =>
      !profileAttempted.has(a.openId) &&
      (!a.profileSyncedAt ||
        (!a.username && a.scopes.includes("user.info.profile"))),
  );
  for (const account of nameless) profileAttempted.add(account.openId);
  if (nameless.length > 0) {
    const repaired = await Promise.all(
      nameless.map(async (account) => {
        try {
          const profile = await fetchProfile(account);
          // The operator may have disconnected this account while TikTok was
          // answering. Writing it back now would reconnect it behind their
          // back, which is what made disconnecting need several attempts.
          const current = await store.getTikTokAccount(account.openId);
          if (!current) return null;
          const updated = { ...current, ...profile };
          await store.saveTikTokAccount(updated);
          return updated;
        } catch {
          // Still unreachable. The stored label stands.
          return null;
        }
      }),
    );
    const byId = new Map(
      repaired.filter((a): a is TikTokAccount => a !== null).map((a) => [a.openId, a]),
    );
    if (byId.size > 0) {
      accounts = accounts.map((a) => byId.get(a.openId) ?? a);
    }
  }

  return {
    configured: isTikTokConfigured(),
    accounts: accounts.map((a) => ({
      openId: a.openId,
      username: a.username,
      displayName:
        a.displayName || a.username || `TikTok ${a.openId.slice(-6) || "account"}`,
      avatarUrl: a.avatarUrl,
      language: a.language,
      scopes: a.scopes,
      canDirectPost: a.scopes.includes("video.publish"),
      canDraft: a.scopes.includes("video.upload"),
      connectedAt: a.connectedAt,
      expiresAt: a.expiresAt ? new Date(a.expiresAt).toISOString() : null,
    })),
  };
}
