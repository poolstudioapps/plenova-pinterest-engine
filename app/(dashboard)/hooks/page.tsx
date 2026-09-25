import { HooksClient } from "@/components/hooks/HooksClient";
import { SectionHeader } from "@/components/ui";
import { plantIdentity } from "@/lib/data/localize";
import { PLANTS } from "@/lib/data/plants";
import { listHookViews } from "@/lib/hooks";
import { DEFAULT_CONTENT_LOCALE, translator } from "@/lib/i18n";
import { isPexelsConfigured } from "@/lib/pexels";
import { getStatus } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

export default async function HooksPage() {
  const t = translator();
  const [{ hooks, unread }, status] = await Promise.all([listHookViews(), getStatus()]);
  // A spied carousel rebuilt from here is written in the accounts' languages.
  const languages = Array.from(new Set(status.accounts.map((a) => a.language)));
  return (
    <>
      <SectionHeader title={t("hooks.title")} description={t("hooks.subtitle")} />
      <HooksClient
        initialHooks={hooks}
        initialUnread={unread}
        plants={PLANTS.map((p) => plantIdentity({ slug: p.slug }))}
        defaultLanguages={languages.length > 0 ? languages : [DEFAULT_CONTENT_LOCALE]}
        hasPexels={isPexelsConfigured()}
      />
    </>
  );
}
