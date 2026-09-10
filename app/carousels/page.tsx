import { CarouselStudio } from "@/components/tiktok/CarouselStudio";
import { Notice, SectionHeader } from "@/components/ui";
import { isGeminiConfigured } from "@/lib/config";
import { plantName } from "@/lib/data/localize";
import { PLANTS } from "@/lib/data/plants";
import { translator } from "@/lib/i18n";
import { getUiLocale } from "@/lib/locale-server";
import { isPexelsConfigured } from "@/lib/pexels";
import { getStore } from "@/lib/store";
import { getStatus } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

export default async function CarouselsPage() {
  const locale = await getUiLocale();
  const t = translator(locale);

  const [carousels, status] = await Promise.all([
    getStore().listCarousels(),
    getStatus(),
  ]);

  return (
    <>
      <SectionHeader
        title={t("carousels.title")}
        description={t("carousels.subtitle")}
      />

      {status.accounts.length === 0 ? (
        <div className="mb-6">
          <Notice tone="info">{t("tiktok.noAccountsBody")}</Notice>
        </div>
      ) : null}

      <CarouselStudio
        uiLocale={locale}
        initialCarousels={carousels}
        plants={PLANTS.map((p) => ({ slug: p.slug, name: plantName(p, locale) }))}
        accounts={status.accounts}
        canGenerate={isGeminiConfigured()}
        hasPexels={isPexelsConfigured()}
      />
    </>
  );
}
