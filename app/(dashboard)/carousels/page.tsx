import Link from "next/link";
import { CarouselStudio } from "@/components/tiktok/CarouselStudio";
import { Notice, SectionHeader } from "@/components/ui";
import { isGeminiConfigured } from "@/lib/config";
import { plantIdentity } from "@/lib/data/localize";
import { PLANTS } from "@/lib/data/plants";
import { translator } from "@/lib/i18n";
import { isPexelsConfigured } from "@/lib/pexels";
import { getStore } from "@/lib/store";
import { getStatus } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

export default async function CarouselsPage() {
  const t = translator();

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
          <Notice tone="info">
            {t("tiktok.noAccountsBody")}{" "}
            <Link href="/tiktok" className="font-medium text-[var(--color-accent)] hover:underline">
              {t("carousels.connectAccount")}
            </Link>
          </Notice>
        </div>
      ) : null}

      <CarouselStudio
        initialCarousels={carousels}
        plants={PLANTS.map((p) => plantIdentity({ slug: p.slug }))}
        accounts={status.accounts}
        canGenerate={isGeminiConfigured()}
        hasPexels={isPexelsConfigured()}
      />
    </>
  );
}
