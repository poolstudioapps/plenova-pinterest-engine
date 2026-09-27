import { cookies } from "next/headers";
import { Sidebar } from "@/components/layout/Sidebar";
import { AUTH_COOKIE, readSession, sessionSecret } from "@/lib/auth";
import { performanceAccess } from "@/lib/performance/dashboard";

/**
 * The signed-in shell: navigation, and the column everything is written in.
 *
 * It lives in a route group rather than in the root layout so that /login and
 * /legal get NONE of it. Before, the login screen rendered the whole sidebar -
 * every section of a tool you had not been let into yet, which both looks
 * broken and quietly tells a stranger what the tool contains.
 *
 * This is presentation only. What actually keeps people out is the middleware,
 * which redirects to /login before any of this is rendered.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Who is signed in, for the foot of the sidebar. Null where sessions are off
  // (local development without a secret).
  const secret = await sessionSecret();
  const email = secret
    ? await readSession(secret, (await cookies()).get(AUTH_COOKIE)?.value)
    : null;

  return (
    <div className="min-h-dvh bg-[var(--color-frame)] md:flex">
      <Sidebar email={email} showPerformance={(await performanceAccess()).allowed} />
      {/*
        The pages sit on a sheet laid on the frame, rather than on the same
        ground as the navigation: the edge between the two is what makes it
        read as an application and not a long web page with links on the left.
      */}
      <main id="main" className="min-w-0 flex-1 md:py-2 md:pr-2">
        <div className="min-h-[calc(100dvh-3.5rem)] rounded-t-[22px] border-t border-[var(--color-edge)] bg-[var(--color-canvas)] px-4 pt-7 pb-16 sm:px-6 md:min-h-[calc(100dvh-1rem)] md:rounded-[22px] md:border md:px-10 md:pt-11 md:pb-20 md:shadow-[var(--shadow-card)]">
          {/*
            Narrower than it was. A form field stretched across a wide screen is
            harder to read, not more generous: the eye has to travel the width of
            the window to get from a label to its value.
          */}
          <div className="mx-auto max-w-5xl">{children}</div>
        </div>
      </main>
    </div>
  );
}
