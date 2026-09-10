import { MediaClient } from "@/components/media/MediaClient";
import { SectionHeader } from "@/components/ui";
import { plantName, visualStyleLabel } from "@/lib/data/localize";
import { VISUAL_STYLES } from "@/lib/data/visual-styles";
import { PLANTS } from "@/lib/data/plants";
import { translator } from "@/lib/i18n";
import { getUiLocale } from "@/lib/locale-server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const locale = await getUiLocale();
  const t = translator(locale);
  const assets = await getStore().listMedia();

  return (
    <>
      <SectionHeader title={t("media.title")} description={t("media.subtitle")} />
      <MediaClient
        uiLocale={locale}
        initialAssets={assets}
        plants={PLANTS.map((p) => ({ slug: p.slug, name: plantName(p, locale) }))}
        styles={VISUAL_STYLES.map((s) => ({
          slug: s.slug,
          label: visualStyleLabel(s, locale),
        }))}
      />
    </>
  );
}
