import "server-only";
import { randomUUID } from "node:crypto";
import { config } from "@/lib/config";
import { badRequest, notFound } from "@/lib/errors";
import { supabaseService } from "@/lib/store/supabase";

/**
 * Ad spend entered by hand on the Performances page, for the channels
 * AppsFlyer gets no cost from (Meta's arrives through AppsFlyer itself). An
 * entry covers one day or a range (a month of TikTok Ads, say) and is spread
 * evenly over its days. Amounts in EUR, as paid.
 */

export interface SpendEntry {
  id: string;
  from: string;
  to: string;
  channel: string;
  amount: number;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

function db() {
  if (!config.supabase.url || !config.supabase.serviceKey)
    throw new Error("Supabase n'est pas configuré.");
  return supabaseService();
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar day: 2026-02-30 is refused, not rolled over to March. */
const isDay = (v: unknown): v is string =>
  typeof v === "string" &&
  DAY.test(v) &&
  new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

export async function listSpend(): Promise<SpendEntry[]> {
  const { data, error } = await db()
    .from("perf_spend")
    .select("*")
    .order("day", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`lecture des dépenses: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    from: r.day as string,
    to: (r.end_day as string | null) ?? (r.day as string),
    channel: r.channel as string,
    amount: Number(r.amount_eur),
    note: (r.note as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

export async function addSpend(
  input: {
    from?: unknown;
    to?: unknown;
    channel?: unknown;
    amount?: unknown;
    note?: unknown;
  },
  createdBy: string | null,
): Promise<SpendEntry> {
  const from = isDay(input.from) ? input.from : null;
  const to = isDay(input.to) ? input.to : from;
  if (!from || !to) throw badRequest("Dates invalides.");
  if (to < from) throw badRequest("La date de fin est avant la date de début.");
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 366)
    throw badRequest("Une saisie couvre un an au plus.");
  const channel =
    typeof input.channel === "string" ? input.channel.trim().slice(0, 40) : "";
  if (!channel) throw badRequest("Choisis un canal.");
  const amount =
    typeof input.amount === "number"
      ? input.amount
      : Number(String(input.amount ?? "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000)
    throw badRequest("Montant invalide.");
  const note =
    typeof input.note === "string" && input.note.trim()
      ? input.note.trim().slice(0, 200)
      : null;

  const row = {
    id: `spend_${randomUUID()}`,
    day: from,
    end_day: to,
    channel,
    amount_eur: Math.round(amount * 100) / 100,
    note,
    created_by: createdBy,
  };
  const { data, error } = await db()
    .from("perf_spend")
    .insert(row)
    .select("created_at")
    .single();
  if (error) throw new Error(`enregistrement de la dépense: ${error.message}`);
  return {
    id: row.id,
    from,
    to,
    channel,
    amount: row.amount_eur,
    note,
    createdBy,
    createdAt: data.created_at as string,
  };
}

export async function deleteSpend(id: string): Promise<void> {
  if (!/^spend_[0-9a-f-]{36}$/.test(id))
    throw badRequest("Identifiant invalide.");
  const { data, error } = await db()
    .from("perf_spend")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`suppression de la dépense: ${error.message}`);
  if (!data?.length) throw notFound("Cette dépense n'existe plus.");
}
