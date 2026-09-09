import { GenerateClient } from "@/components/generate/GenerateClient";
import { SectionHeader } from "@/components/ui";
import { isGeminiConfigured } from "@/lib/config";
import { ANGLES, ANGLE_CATEGORIES } from "@/lib/data/angles";
import {
  angleCategoryLabel,
  angleLabel,
  plantName,
  visualStyleLabel,
} from "@/lib/data/localize";
import { PLANTS } from "@/lib/data/plants";
import { VISUAL_STYLES } from "@/lib/data/visual-styles";
import { translator } from "@/lib/i18n";
import { getUiLocale } from "@/lib/locale-server";

export const dynamic = "force-dynamic";

export default async function GeneratePage() {
  const locale = await getUiLocale();
  const t = translator(locale);

  // Labels are localized server-side so the client component stays a dumb
  // renderer and never needs the catalog or the dictionaries.
  return (
    <>
      <SectionHeader title={t("generate.title")} description={t("generate.subtitle")} />
      <GenerateClient
        uiLocale={locale}
        plants={PLANTS.map((p) => ({ slug: p.slug, name: plantName(p, locale) }))}
        angles={ANGLES.map((a) => ({
          slug: a.slug,
          label: angleLabel(a, locale),
          category: a.category,
        }))}
        styles={VISUAL_STYLES.map((s) => ({
          slug: s.slug,
          label: visualStyleLabel(s, locale),
        }))}
        categories={ANGLE_CATEGORIES.map((c) => ({
          key: c.key,
          label: angleCategoryLabel(c.key, locale),
        }))}
        canGenerate={isGeminiConfigured()}
      />
    </>
  );
}
