import "server-only";

/**
 * Central server-side configuration. Nothing here is ever imported from a
 * client component - every value is read from process.env at request time.
 */

const DEFAULT_ONELINK = "https://plenova.onelink.me/nQZF/0f2sata";

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

/**
 * Resolves the public base URL of this deployment.
 *
 * NEXT_PUBLIC_APP_URL is a chicken-and-egg problem: you cannot know the domain
 * until the first deploy exists. So it is optional, and Vercel's own injected
 * variables are used instead, in order of stability:
 *
 *  1. NEXT_PUBLIC_APP_URL         - explicit override, e.g. a custom domain.
 *  2. VERCEL_PROJECT_PRODUCTION_URL - the stable production domain. This is the
 *     one that matters for OAuth, since the redirect URI registered on
 *     Pinterest must never change between deploys.
 *  3. VERCEL_URL                  - per-deployment URL. Changes on every push,
 *     so it is a last resort and unusable as an OAuth redirect target.
 *  4. localhost                   - local development.
 *
 * Vercel supplies (2) and (3) as bare hostnames, without a scheme.
 */
function resolveAppUrl(): string {
  const explicit = env("NEXT_PUBLIC_APP_URL");
  if (explicit) return explicit.replace(/\/+$/, "");

  const productionHost = env("VERCEL_PROJECT_PRODUCTION_URL");
  if (productionHost) return `https://${productionHost}`;

  const deploymentHost = env("VERCEL_URL");
  if (deploymentHost) return `https://${deploymentHost}`;

  return "http://localhost:3000";
}

export const config = {
  gemini: {
    apiKey: env("GEMINI_API_KEY"),
    /**
     * Model IDs verified against @google/genai 2.21.0 type definitions and the
     * Gemini API model catalog. Overridable so a model rename never requires a
     * code change.
     */
    textModel: env("GEMINI_TEXT_MODEL") ?? "gemini-3.8-flash",
    /**
     * Flash is the default: side-by-side it matched gemini-3-pro-image on
     * editorial quality at roughly half the latency and a fraction of the
     * cost, which matters at 1,000+ Pins. Override to gemini-3-pro-image if
     * a specific angle needs it.
     */
    imageModel: env("GEMINI_IMAGE_MODEL") ?? "gemini-3.1-flash-image",
  },
  pinterest: {
    appId: env("PINTEREST_APP_ID"),
    appSecret: env("PINTEREST_APP_SECRET"),
    redirectUri: env("PINTEREST_REDIRECT_URI"),
    /** Sandbox host is useful while the developer app is pending approval. */
    apiBase:
      env("PINTEREST_API_ENV") === "sandbox"
        ? "https://api-sandbox.pinterest.com/v5"
        : "https://api.pinterest.com/v5",
    authorizeUrl: "https://www.pinterest.com/oauth/",
    /** Organic content scopes. See §13 of the spec. */
    scopes: ["boards:read", "boards:write", "pins:read", "pins:write"],
    /**
     * Manually supplied access token. Pinterest does not release the app
     * secret while an app is in trial review, so OAuth cannot run - but a
     * short-lived trial token can still drive read calls. This is the escape
     * hatch for that window.
     */
    accessToken: env("PINTEREST_ACCESS_TOKEN"),
    /** Scopes that manual token actually carries. Trial tokens are read-only. */
    tokenScopes: (env("PINTEREST_TOKEN_SCOPES") ?? "")
      .split(/[,\s]+/)
      .filter(Boolean),
  },
  app: {
    url: resolveAppUrl(),
    oneLink: env("APPSFLYER_ONELINK") ?? DEFAULT_ONELINK,
  },
  security: {
    tokenEncryptionKey: env("TOKEN_ENCRYPTION_KEY"),
    cronSecret: env("CRON_SECRET"),
  },
  storage: {
    blobToken: env("BLOB_READ_WRITE_TOKEN"),
  },
} as const;

export function isGeminiConfigured(): boolean {
  return Boolean(config.gemini.apiKey);
}

/** True when the full OAuth flow can run (needs the app secret). */
export function isPinterestConfigured(): boolean {
  return Boolean(
    config.pinterest.appId &&
      config.pinterest.appSecret &&
      resolveRedirectUri(),
  );
}

/** True when a manual token is supplying access instead of OAuth. */
export function hasManualPinterestToken(): boolean {
  return Boolean(config.pinterest.accessToken);
}

/** Publishing needs pins:write; trial tokens do not carry it. */
export function manualTokenCanPublish(): boolean {
  const scopes = config.pinterest.tokenScopes;
  // No declared scopes means we cannot prove it is safe - assume read-only.
  return scopes.includes("pins:write");
}

/**
 * The redirect URI must match the value registered on the Pinterest app
 * exactly. We prefer the explicit env var and fall back to the app URL.
 */
export function resolveRedirectUri(): string | undefined {
  const explicit = config.pinterest.redirectUri;
  if (explicit) return explicit;
  if (config.app.url) {
    return new URL("/api/pinterest/callback", config.app.url).toString();
  }
  return undefined;
}

/** Human-readable readiness report surfaced on the dashboard. */
export interface ReadinessReport {
  gemini: boolean;
  pinterest: boolean;
  blobStorage: boolean;
  encryptionKey: boolean;
  warnings: string[];
}

export function readiness(): ReadinessReport {
  const warnings: string[] = [];
  const gemini = isGeminiConfigured();
  const pinterest = isPinterestConfigured();
  const blobStorage = Boolean(config.storage.blobToken);
  const encryptionKey = Boolean(config.security.tokenEncryptionKey);

  if (!gemini) warnings.push("GEMINI_API_KEY is missing - generation is disabled.");
  if (!pinterest && hasManualPinterestToken()) {
    warnings.push(
      manualTokenCanPublish()
        ? "Using a manually supplied Pinterest token - OAuth is not configured."
        : "Pinterest trial token is read-only (no pins:write). Boards can be read, but Pins cannot be published yet.",
    );
  } else if (!pinterest) {
    warnings.push(
      "Pinterest credentials are missing - publishing stays in preview mode.",
    );
  }
  if (!blobStorage)
    warnings.push(
      "No Blob store attached - images stay inline and Pins cannot be published to Pinterest.",
    );
  if (!encryptionKey && pinterest)
    warnings.push(
      "TOKEN_ENCRYPTION_KEY is missing - OAuth tokens cannot be stored at rest.",
    );

  return {
    gemini,
    pinterest,
    blobStorage,
    encryptionKey,
    warnings,
  };
}
