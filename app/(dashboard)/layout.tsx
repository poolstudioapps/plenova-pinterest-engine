import { Sidebar } from "@/components/layout/Sidebar";

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
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="md:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 px-5 py-8 md:px-10 md:py-12">
        {/*
          Narrower than it was. A form field stretched across a wide screen is
          harder to read, not more generous: the eye has to travel the width of
          the window to get from a label to its value.
        */}
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
