import "server-only";
import { cookies } from "next/headers";
import { teamOf } from "@/lib/allowlist";
import { AUTH_COOKIE, readSession, sessionSecret } from "@/lib/auth";
import type { Team } from "@/lib/types";

/** The team chosen on the Spy page by someone whose address has none. */
export const TEAM_COOKIE = "plenova_team";

export interface Viewer {
  email: string | null;
  /** Who this person processes spied carousels for; null until known or chosen. */
  team: Team | null;
  /** Set by the address itself (allowlist), so not something to pick. */
  fixed: boolean;
}

/**
 * Who is looking, and for which team. The Spy's "to process" list and the
 * carousels handled are kept per team - Mr Stark and Mr Mousk work through
 * the same competitors each on their own (asked for by the user). The
 * signed-in address decides; an address without a team picks one on the Spy
 * page, remembered in a cookie.
 */
export async function viewer(): Promise<Viewer> {
  const jar = await cookies();
  const secret = await sessionSecret();
  const email = secret ? await readSession(secret, jar.get(AUTH_COOKIE)?.value) : null;
  const mapped = email ? await teamOf(email) : null;
  if (mapped) return { email, team: mapped, fixed: true };
  const chosen = jar.get(TEAM_COOKIE)?.value;
  return { email, team: chosen === "stark" || chosen === "mousk" ? chosen : null, fixed: false };
}
