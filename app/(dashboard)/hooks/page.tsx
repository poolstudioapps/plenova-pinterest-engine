import { HooksClient } from "@/components/hooks/HooksClient";
import { SectionHeader } from "@/components/ui";
import { plantIdentity } from "@/lib/data/localize";
import { PLANTS } from "@/lib/data/plants";
import { listHooks } from "@/lib/hooks";
import { translator } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function HooksPage() {
  const t = translator();
  const hooks = await listHooks();
  return (
    <>
      <SectionHeader title={t("hooks.title")} description={t("hooks.subtitle")} />
      <HooksClient initialHooks={hooks} plants={PLANTS.map((p) => plantIdentity({ slug: p.slug }))} />
    </>
  );
}
