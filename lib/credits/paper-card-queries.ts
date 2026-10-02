import { createClient } from "@/lib/supabase/server";
import { localizedPlayerName } from "@/lib/org/display-name";
import { addCalendarDays } from "@/lib/org/session-recurrence";
import { formatIsoDate, getSeasonStart, parseIsoDate } from "@/lib/age-band";
import type { PaperCard, PaperCardCheck, Player } from "@/lib/supabase/database.types";

export const PAPER_CARDS_BUCKET = "paper-cards";

export type PaperCardRow = PaperCard & { playerLabel: string; unmatchedDates: string[] };

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapCard(raw: Record<string, unknown>, locale: string): PaperCardRow {
  const { players, paper_card_unmatched_dates, ...card } = raw;
  const player = one(players as Player | Player[] | null);
  const unmatched = (paper_card_unmatched_dates as { used_date: string }[] | null) ?? [];
  return {
    ...(card as PaperCard),
    playerLabel: player ? localizedPlayerName(player, locale) : "",
    unmatchedDates: unmatched.map((row) => row.used_date).sort(),
  };
}

/** Cards for the move-in page (RLS: admin). Newest first. */
export async function listPaperCards(locale: string): Promise<PaperCardRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("paper_cards")
    .select("*, players(*), paper_card_unmatched_dates(used_date)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    console.error("listPaperCards", error.message);
    return [];
  }
  return (data ?? []).map((row) => mapCard(row as Record<string, unknown>, locale));
}

export async function getPaperCard(id: string, locale: string): Promise<PaperCardRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("paper_cards")
    .select("*, players(*), paper_card_unmatched_dates(used_date)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getPaperCard", error.message);
    return null;
  }
  return data ? mapCard(data as Record<string, unknown>, locale) : null;
}

/** Short-lived links to the card photos (RLS: admin). */
export async function signCardPhotos(paths: readonly string[]): Promise<string[]> {
  if (paths.length === 0) {
    return [];
  }
  const supabase = await createClient();
  const { data } = await supabase.storage.from(PAPER_CARDS_BUCKET).createSignedUrls([...paths], 600);
  return (data ?? []).map((row) => row.signedUrl).filter((url): url is string => Boolean(url));
}

/**
 * Club dates on which any active team of the player had a session, over the
 * last `days` days: the second check on the AI read-out.
 */
export async function playerSessionDates(playerId: string, today: string, days = 400): Promise<Set<string>> {
  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("team_memberships")
    .select("team_id")
    .eq("player_id", playerId)
    .eq("status", "active");
  const teamIds = (memberships ?? []).map((row) => row.team_id);
  if (teamIds.length === 0) {
    return new Set();
  }
  const from = addCalendarDays(today, -days) ?? today;
  const { data, error } = await supabase
    .from("training_sessions")
    .select("starts_at")
    .in("team_id", teamIds)
    .is("deleted_at", null)
    .gte("starts_at", `${from}T00:00:00+08:00`)
    .lte("starts_at", `${today}T23:59:59+08:00`);
  if (error) {
    console.error("playerSessionDates", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((row) => clubDateOf(row.starts_at)));
}

/** Asia/Taipei calendar date of a timestamp (UTC+8, no DST). */
export function clubDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export type PaperCheckRow = PaperCardCheck & { playerLabel: string };

export async function listPaperCardChecks(locale: string, limit = 100): Promise<PaperCheckRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("paper_card_checks")
    .select("*, players(*)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listPaperCardChecks", error.message);
    return [];
  }
  return (data ?? []).map((raw) => {
    const { players, ...check } = raw as Record<string, unknown>;
    const player = one(players as Player | Player[] | null);
    return { ...(check as PaperCardCheck), playerLabel: player ? localizedPlayerName(player, locale) : "" };
  });
}

export type PaperCardStats = {
  movedPlayers: number;
  rosterPlayers: number;
  seasonMismatches: number;
  seasonChecks: number;
};

/** Dashboard: moved cards over the active roster, and this season's check results. */
export async function loadPaperCardStats(today: string): Promise<PaperCardStats> {
  const supabase = await createClient();
  const todayDate = parseIsoDate(today);
  const seasonStart = todayDate ? formatIsoDate(getSeasonStart(todayDate)) : today;
  const [{ data: cards }, { count: roster }, { data: checks }] = await Promise.all([
    supabase.from("paper_cards").select("player_id").neq("status", "draft"),
    supabase.from("players").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("paper_card_checks").select("matches").gte("check_date", seasonStart),
  ]);
  return {
    movedPlayers: new Set((cards ?? []).map((row) => row.player_id)).size,
    rosterPlayers: roster ?? 0,
    seasonMismatches: (checks ?? []).filter((row) => !row.matches).length,
    seasonChecks: (checks ?? []).length,
  };
}
