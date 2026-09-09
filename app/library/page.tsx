import { LibraryClient } from "@/components/library/LibraryClient";
import { SectionHeader } from "@/components/ui";
import { ANGLES } from "@/lib/data/angles";
import { angleLabel, plantName } from "@/lib/data/localize";
import { PLANTS } from "@/lib/data/plants";
import { translator } from "@/lib/i18n";
import { getUiLocale } from "@/lib/locale-server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const locale = await getUiLocale();
  const t = translator(locale);
  const pins = await getStore().listPins();

  return (
    <>
      <SectionHeader title={t("library.title")} description={t("library.subtitle")} />
      <LibraryClient
        uiLocale={locale}
        initialPins={pins}
        plants={PLANTS.map((p) => ({ slug: p.slug, name: plantName(p, locale) }))}
        angles={ANGLES.map((a) => ({ slug: a.slug, label: angleLabel(a, locale) }))}
      />
    </>
  );
}
