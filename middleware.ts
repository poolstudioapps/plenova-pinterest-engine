import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, isPublicPath, verifySession } from "@/lib/auth";

/**
 * Gate for the whole dashboard. Runs before every route except the allowlist
 * in lib/auth.ts.
 *
 * When ADMIN_PASSWORD is unset the gate stays open, so local development and
 * the very first deploy are not locked out. The dashboard reports that state
 * rather than hiding it.
 */
export async function middleware(request: NextRequest) {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const session = request.cookies.get(AUTH_COOKIE)?.value;
  if (await verifySession(secret, session)) return NextResponse.next();

  // API calls get a JSON 401 rather than an HTML redirect they cannot follow.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Sign in to use this API." } },
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/).*)"],
};
