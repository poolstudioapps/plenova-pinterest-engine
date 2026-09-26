import { SpyClient } from "@/components/spy/SpyClient";
import { SectionHeader } from "@/components/ui";
import { DEFAULT_CONTENT_LOCALE, translator } from "@/lib/i18n";
import { isPexelsConfigured } from "@/lib/pexels";
import { spyOverview } from "@/lib/spy";
import { getStatus } from "@/lib/tiktok";
import { viewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function SpyPage() {
  const t = translator();
  const { team, fixed } = await viewer();
  const [overview, status] = await Promise.all([spyOverview(team), getStatus()]);
  // Rebuilt in the languages the connected accounts publish in, by default.
  const languages = Array.from(new Set(status.accounts.map((a) => a.language)));

  return (
    <>
      <SectionHeader title={t("spy.title")} description={t("spy.subtitle")} />
      <SpyClient
        initialPosts={overview.posts}
        initialAccounts={overview.accounts}
        run={overview.run}
        defaultLanguages={languages.length > 0 ? languages : [DEFAULT_CONTENT_LOCALE]}
        hasPexels={isPexelsConfigured()}
        team={team}
        teamFixed={fixed}
      />
    </>
  );
}
