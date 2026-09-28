import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, isPublicPath, readSession, sessionSecret } from "@/lib/auth";
import {
  isReviewer,
  REVIEW_PAGES,
  reviewEmail,
  reviewerMay,
  reviewerPage,
} from "@/lib/review";

/**
 * Gate for the whole dashboard. Runs before every route except the allowlist
 * in lib/auth.ts.
 *
 * In PRODUCTION it never opens without a valid session. It used to swing open
 * whenever ADMIN_PASSWORD happened to be unset, which meant a deployment could
 * sit wide open on a public URL because of a missing variable - the one
 * failure mode a front door must not have. A missing session secret now locks
 * everyone out instead, including whoever forgot to set it.
 *
 * Off production the gate is open, because that is localhost.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const secret = await sessionSecret();
  const session = request.cookies.get(AUTH_COOKIE)?.value;
  const identity = secret ? await readSession(secret, session) : null;
  // The platform reviewers' test account reads and writes nothing, and its
  // sessions end the moment the account is taken out of Vercel (lib/review.ts).
  const reviewer = isReviewer(identity);
  if (identity && (!reviewer || reviewEmail())) {
    if (reviewer && !reviewerMay(request.method, pathname)) {
      return NextResponse.json(
        {
          error: {
            code: "read_only",
            message: "Review account: read-only, this action is disabled.",
          },
        },
        { status: 403 },
      );
    }
    // ...and sees only the TikTok pages: any other page leads to the first.
    if (reviewer && !pathname.startsWith("/api/") && !reviewerPage(pathname)) {
      return NextResponse.redirect(new URL(REVIEW_PAGES[0], request.url));
    }
    return NextResponse.next();
  }

  // API calls get a JSON 401 rather than an HTML redirect they cannot follow.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Connecte-toi pour utiliser cette API." } },
      { status: 401 },
    );
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  /**
   * Skip Next internals and the font the slide renderer fetches.
   *
   * Listed literally rather than matched by file extension. An earlier version
   * used a "has a dot in it" pattern, but `\.` inside a TypeScript string is
   * just `.`, which matches any character - so every path was excluded and the
   * gate silently stopped protecting anything. Naming the paths cannot fail
   * that way.
   */
  // The brand assets (the logo, the favicon) are open too: the login page
  // shows them to someone who is by definition not signed in yet, and they
  // are the product's public face rather than anything to protect.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/|fonts/).*)",
  ],
};
