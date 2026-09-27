/**
 * Mounted afresh on every navigation (a layout is not), so each page settles
 * into place as you arrive on it - once, briefly, and not at all for someone
 * who asked for reduced motion (see .rise-in).
 */
export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="rise-in">{children}</div>;
}
