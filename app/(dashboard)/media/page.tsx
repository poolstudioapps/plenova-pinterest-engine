import { MediaClient } from "@/components/media/MediaClient";
import { SectionHeader } from "@/components/ui";
import { plantIdentity, visualStyleLabel } from "@/lib/data/localize";
import { VISUAL_STYLES } from "@/lib/data/visual-styles";
import { PLANTS } from "@/lib/data/plants";
import { translator } from "@/lib/i18n";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const t = translator();
  const assets = await getStore().listMedia();

  return (
    <>
      <SectionHeader title={t("media.title")} description={t("media.subtitle")} />
      <MediaClient
        initialAssets={assets}
        plants={PLANTS.map((p) => plantIdentity({ slug: p.slug }))}
        styles={VISUAL_STYLES.map((s) => ({
          slug: s.slug,
          label: visualStyleLabel(s),
        }))}
      />
    </>
  );
}
