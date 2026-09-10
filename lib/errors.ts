/**
 * Typed application errors. Every API route funnels through `toErrorResponse`
 * so we never leak stack traces, tokens or upstream payloads to the browser.
 */

export type ErrorCode =
  | "bad_request"
  | "not_configured"
  | "not_connected"
  | "token_expired"
  | "upstream_error"
  | "rate_limited"
  | "duplicate"
  | "not_found"
  | "internal";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    status = 400,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (m: string, d?: unknown) =>
  new AppError("bad_request", m, 400, d);
export const notConfigured = (m: string) =>
  new AppError("not_configured", m, 503);
export const notConnected = (m: string) => new AppError("not_connected", m, 409);
export const notFound = (m: string) => new AppError("not_found", m, 404);
export const upstream = (m: string, d?: unknown) =>
  new AppError("upstream_error", m, 502, d);
export const rateLimited = (m: string) => new AppError("rate_limited", m, 429);
export const duplicate = (m: string, d?: unknown) =>
  new AppError("duplicate", m, 409, d);

/** Strings that must never reach a log line or an HTTP response body. */
const SECRET_ENV_KEYS = [
  "GEMINI_API_KEY",
  "PINTEREST_APP_SECRET",
  "TIKTOK_CLIENT_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "CRON_SECRET",
];

/** Replaces any live secret value found in a string with `[redacted]`. */
export function redact(input: string): string {
  let out = input;
  for (const key of SECRET_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.length >= 8) {
      out = out.split(value).join("[redacted]");
    }
  }
  // Bearer tokens, plus the token shapes each provider issues.
  out = out.replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer [redacted]");
  out = out.replace(/\bpina_[A-Za-z0-9._\-]+/g, "[redacted]");
  // TikTok access and refresh tokens.
  out = out.replace(/\bact\.[A-Za-z0-9._\-]+/g, "[redacted]");
  out = out.replace(/\brft\.[A-Za-z0-9._\-]+/g, "[redacted]");
  return out;
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export function toErrorResponse(err: unknown): {
  body: ErrorBody;
  status: number;
} {
  if (err instanceof AppError) {
    return {
      body: {
        error: {
          code: err.code,
          message: redact(err.message),
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      },
      status: err.status,
    };
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  console.error("[unhandled]", redact(message));
  return {
    body: { error: { code: "internal", message: "Unexpected server error." } },
    status: 500,
  };
}
