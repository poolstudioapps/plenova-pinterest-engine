import "server-only";
import { config } from "@/lib/config";
import { getStore } from "@/lib/store";
import { supabaseService } from "@/lib/store/supabase";
import type { SpyAccount, SpyPost } from "@/lib/types";

/**
 * Our own accounts, as the spy measures them: Mr Stark against Mr Mousk.
 *
 * Two kinds of numbers, and the page says which is which. Followers and total
 * likes come from each profile and are exact. Views, saves, comments and
 * shares are the sum of the posts the spy has seen - the ones in each
 * profile's latest list since the spy started watching it, refreshed for two
 * months - so they grow as the spy keeps running.
 */

export interface AccountSnapshot {
  username: string;
  day: string;
  followers: number | null;
  likesTotal: number | null;
}

export interface VersusData {
  accounts: SpyAccount[];
  posts: SpyPost[];
  snapshots: AccountSnapshot[];
}

export async function versusData(): Promise<VersusData> {
  const store = getStore();
  const [accounts, posts] = await Promise.all([store.listSpyAccounts(), store.listSpyPosts()]);
  const ours = accounts.filter((a) => a.team);
  const names = new Set(ours.map((a) => a.username));

  // Every day ever recorded, page by page: "Depuis le début" means it.
  const snapshots: AccountSnapshot[] = [];
  if (config.supabase.url && config.supabase.serviceKey && names.size > 0) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseService()
        .from("spy_account_stats")
        .select("username, day, followers, likes_total")
        .in("username", [...names])
        .order("day")
        .order("username")
        .range(from, from + 999);
      if (error) throw new Error(`historique des comptes: ${error.message}`);
      for (const r of data ?? []) {
        snapshots.push({
          username: r.username as string,
          day: r.day as string,
          followers: r.followers == null ? null : Number(r.followers),
          likesTotal: r.likes_total == null ? null : Number(r.likes_total),
        });
      }
      if ((data ?? []).length < 1000) break;
    }
  }

  return {
    accounts: ours,
    posts: posts.filter((p) => names.has(p.username)),
    snapshots,
  };
}
