import { LibraryClient } from "@/components/library/LibraryClient";
import { SectionHeader } from "@/components/ui";
import { ANGLES } from "@/lib/data/angles";
import { angleLabel, plantIdentity } from "@/lib/data/localize";
import { PLANTS } from "@/lib/data/plants";
import { translator } from "@/lib/i18n";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const t = translator();
  const pins = await getStore().listPins();

  return (
    <>
      <SectionHeader title={t("library.title")} description={t("library.subtitle")} />
      <LibraryClient
        initialPins={pins}
        plants={PLANTS.map((p) => plantIdentity({ slug: p.slug }))}
        angles={ANGLES.map((a) => ({ slug: a.slug, label: angleLabel(a) }))}
      />
    </>
  );
}
