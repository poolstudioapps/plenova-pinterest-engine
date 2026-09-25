import { Anton } from "next/font/google";
import { SectionHeader } from "@/components/ui";
import { VersusClient } from "@/components/versus/VersusClient";
import { versusData } from "@/lib/versus";

export const dynamic = "force-dynamic";

/* The poster lettering, for this screen only. */
const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-versus", display: "swap" });

export default async function VersusPage() {
  const { accounts, posts, snapshots } = await versusData();
  // Formatted here, in Paris time, so the server and the browser print the same date.
  const first = posts.map((p) => p.firstSeenAt).sort()[0];
  const trackedSince = first
    ? new Date(first).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })
    : null;

  return (
    <div className={anton.variable}>
      <SectionHeader
        title="Mr Stark vs Mr Mousk"
        description="Nos comptes TikTok, équipe contre équipe, relevés à chaque passage du spy."
      />
      <VersusClient initialAccounts={accounts} posts={posts} snapshots={snapshots} trackedSince={trackedSince} />
    </div>
  );
}
