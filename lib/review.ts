/**
 * The one sign-in by password: a test account for platform reviewers.
 *
 * Everyone else signs in with a link sent to an allowlisted mailbox, which a
 * reviewer cannot read - and TikTok asks for "a valid test account and
 * password" when the website is a login page. So: one address and one
 * password, both set in Vercel (REVIEW_EMAIL, REVIEW_PASSWORD), never in the
 * repo. Unset, the door does not exist.
 *
 * The account is read-only, enforced in the middleware: it can open every
 * page and read, but every write is refused, and so is connecting a Pinterest
 * or TikTok account (that would replace ours). Revenue stays closed to it like
 * to anyone not marked sees_revenue.
 *
 * No Node import: the middleware runs this too.
 */

/** A password this short is a guess away: the door stays shut. */
const MIN_PASSWORD = 12;

/** The review address, lowercased, or null when the account is not set up. */
export function reviewEmail(): string | null {
  const email = process.env.REVIEW_EMAIL?.trim().toLowerCase();
  const password = process.env.REVIEW_PASSWORD ?? "";
  return email && password.length >= MIN_PASSWORD ? email : null;
}

/**
 * The review account's session carries this mark inside its signed identity,
 * so it stays read-only whatever happens to the variables later: without the
 * mark, taking REVIEW_EMAIL out of Vercel would have turned a reviewer's
 * open session into a full one. The e-mail sign-in never produces it: it
 * only signs in addresses of the allowlist, and none starts with it.
 */
export const REVIEW_MARK = "review:";

export function isReviewer(identity: string | null): boolean {
  return identity?.startsWith(REVIEW_MARK) ?? false;
}

/** Linking an account of ours: a GET that ends up writing our tokens. */
const CONNECT = ["/api/pinterest/connect", "/api/tiktok/connect"];

/** What the review account may do: read, and nothing that writes. */
export function reviewerMay(method: string, pathname: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  return !CONNECT.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
