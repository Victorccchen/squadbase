import { createClient } from "@/lib/supabase/server";
import { splitMemberships } from "@/lib/org/membership-display";
import { englishPlayerName, localizedPlayerName } from "@/lib/org/display-name";
import { catalogBandFromTeamAgeBand, type PackageCatalogBand } from "@/lib/credits/debit-rules";
import type {
  BankDeposit,
  CashClosing,
  CashReceipt,
  PaymentItem,
  Player,
  Team,
  TeamMembership,
} from "@/lib/supabase/database.types";

export const DEPOSIT_SLIPS_BUCKET = "deposit-slips";

export type CashReceiptRow = CashReceipt & { player: Player | null; item: PaymentItem | null };

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapReceipt(row: Record<string, unknown>): CashReceiptRow {
  const { players, payment_items, ...receipt } = row;
  return {
    ...(receipt as CashReceipt),
    player: one(players as Player | Player[] | null),
    item: one(payment_items as PaymentItem | PaymentItem[] | null),
  };
}

/** Receipts for the director's page (RLS: director or admin). Newest first. */
export async function listCashReceipts(options: { receivedBy?: string; limit?: number } = {}): Promise<CashReceiptRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("cash_receipts")
    .select("*, players(*), payment_items(*)")
    .order("received_at", { ascending: false })
    .limit(options.limit ?? 100);
  if (options.receivedBy) {
    query = query.eq("received_by", options.receivedBy);
  }
  const { data, error } = await query;
  if (error) {
    console.error("listCashReceipts", error.message);
    return [];
  }
  return (data ?? []).map((row) => mapReceipt(row as Record<string, unknown>));
}

/** Parent view: the e-receipts for their children (RLS: approved guardian). */
export async function listOwnCashReceipts(playerIds: string[]): Promise<CashReceiptRow[]> {
  if (playerIds.length === 0) {
    return [];
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_receipts")
    .select("*, players(*), payment_items(*)")
    .in("player_id", playerIds)
    .order("received_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("listOwnCashReceipts", error.message);
    return [];
  }
  return (data ?? []).map((row) => mapReceipt(row as Record<string, unknown>));
}

export type ClosingRow = CashClosing & { depositId: string | null };

export async function listClosings(options: { closedBy?: string } = {}): Promise<ClosingRow[]> {
  const supabase = await createClient();
  let query = supabase.from("cash_closings").select("*").order("closing_date", { ascending: false }).limit(100);
  if (options.closedBy) {
    query = query.eq("closed_by", options.closedBy);
  }
  const [{ data, error }, { data: links }] = await Promise.all([
    query,
    supabase.from("bank_deposit_closings").select("deposit_id, closing_id"),
  ]);
  if (error) {
    console.error("listClosings", error.message);
    return [];
  }
  const depositByClosing = new Map((links ?? []).map((row) => [row.closing_id, row.deposit_id]));
  return ((data ?? []) as CashClosing[]).map((row) => ({ ...row, depositId: depositByClosing.get(row.id) ?? null }));
}

export type DepositRow = BankDeposit & { closings: CashClosing[] };

export async function listDeposits(): Promise<DepositRow[]> {
  const supabase = await createClient();
  const [{ data, error }, { data: links }, { data: closings }] = await Promise.all([
    supabase.from("bank_deposits").select("*").order("deposit_date", { ascending: false }).limit(100),
    supabase.from("bank_deposit_closings").select("deposit_id, closing_id"),
    supabase.from("cash_closings").select("*"),
  ]);
  if (error) {
    console.error("listDeposits", error.message);
    return [];
  }
  const closingById = new Map(((closings ?? []) as CashClosing[]).map((row) => [row.id, row]));
  return ((data ?? []) as BankDeposit[]).map((deposit) => ({
    ...deposit,
    closings: (links ?? [])
      .filter((row) => row.deposit_id === deposit.id)
      .map((row) => closingById.get(row.closing_id))
      .filter((row): row is CashClosing => Boolean(row)),
  }));
}

export type CashPlayer = {
  id: string;
  label: string;
  searchText: string;
  band: PackageCatalogBand | null;
  creditsAvailable: number;
};

/** Active players with their primary 梯隊 for the director's search (RLS: director or admin). */
export async function listCashPlayers(locale: string): Promise<CashPlayer[]> {
  const supabase = await createClient();
  const [{ data: players, error }, { data: balances }] = await Promise.all([
    supabase.from("players").select("*, team_memberships(*, teams(*))").eq("status", "active"),
    supabase.from("player_session_balances").select("player_id, credits_available"),
  ]);
  if (error) {
    console.error("listCashPlayers", error.message);
    return [];
  }
  const balanceById = new Map((balances ?? []).map((row) => [row.player_id, row.credits_available]));
  return (players ?? []).map((raw) => {
    const row = raw as Player & { team_memberships: (TeamMembership & { teams: Team | Team[] | null })[] | null };
    const memberships = (row.team_memberships ?? []).map((m) => ({ ...m, team: one(m.teams) }));
    const { ageSquad } = splitMemberships(memberships);
    const teamName = ageSquad?.team?.name ?? "";
    const band = ageSquad?.team ? catalogBandFromTeamAgeBand(ageSquad.team.age_band) : null;
    const name = localizedPlayerName(row, locale);
    return {
      id: row.id,
      label: teamName ? `${name} · ${teamName}` : name,
      searchText: [row.name_zh, row.name_ja, englishPlayerName(row), teamName].filter(Boolean).join(" "),
      band,
      creditsAvailable: balanceById.get(row.id) ?? 0,
    };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

/** Staff can see who holds the director role (admin only via profiles RLS). */
export async function listDirectorProfiles(): Promise<{ id: string; label: string; isDirector: boolean }[]> {
  const supabase = await createClient();
  const [{ data: profiles }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, phone").order("display_name"),
    supabase.from("user_roles").select("user_id, role").eq("role", "director"),
  ]);
  const directors = new Set((roles ?? []).map((row) => row.user_id));
  return (profiles ?? []).map((row) => ({
    id: row.id,
    label: row.display_name?.trim() || row.phone || row.id.slice(0, 8),
    isDirector: directors.has(row.id),
  }));
}

/** Short-lived links to deposit slips (RLS: director or admin). */
export async function signSlipPaths(paths: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  const result = new Map<string, string>();
  if (wanted.length === 0) {
    return result;
  }
  const supabase = await createClient();
  const { data } = await supabase.storage.from(DEPOSIT_SLIPS_BUCKET).createSignedUrls(wanted, 600);
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) {
      result.set(row.path, row.signedUrl);
    }
  }
  return result;
}
