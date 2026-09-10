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
   * Skip Next internals and anything that looks like a static file.
   *
   * The trailing extension check matters: the slide renderer fetches
   * /fonts/TikTokSans.woff2 from the browser, and without this the gate would
   * answer that request with a redirect to the login page instead of the font.
   * It happens to work while a session cookie is present, but running auth over
   * static assets is wasted work and fails in ways that are hard to read.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.[a-zA-Z0-9]+$).*)"],
};
