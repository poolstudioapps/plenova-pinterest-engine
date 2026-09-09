import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { config } from "./config";

/**
 * AES-256-GCM envelope for OAuth tokens at rest. The store only ever holds the
 * ciphertext, so a leaked blob/file is useless without TOKEN_ENCRYPTION_KEY.
 */

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

function key(): Buffer {
  const raw = config.security.tokenEncryptionKey;
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${buf.length}).`,
    );
  }
  return buf;
}

export function hasEncryptionKey(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/** Returns `v1.<iv>.<authTag>.<ciphertext>`, all base64url. */
export function encryptJson(value: unknown): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptJson<T>(payload: string): T {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Malformed encrypted payload.");
  }
  const iv = Buffer.from(parts[1]!, "base64url");
  const tag = Buffer.from(parts[2]!, "base64url");
  const ciphertext = Buffer.from(parts[3]!, "base64url");
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

/** Constant-time comparison for cron secrets and OAuth state. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Derives an unguessable, stable path segment from the encryption key.
 *
 * Pin images have to live in a PUBLIC Blob store - Pinterest fetches them by
 * URL with no auth header. That means the engine's state document may end up
 * in a public store too, so it must not sit at a guessable path like
 * "engine/state.json". Its contents are already AES-GCM encrypted where it
 * matters (OAuth tokens); this closes the enumeration hole on the rest.
 *
 * Falls back to a fixed label when no key is configured, which only happens in
 * local development where the file store is used anyway.
 */
export function derivePathSegment(label: string): string {
  const raw = config.security.tokenEncryptionKey;
  if (!raw) return label;
  return createHmac("sha256", Buffer.from(raw, "base64"))
    .update(label)
    .digest("hex")
    .slice(0, 32);
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
