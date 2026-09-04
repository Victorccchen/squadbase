import { createClient } from "@/lib/supabase/server";
import { getAppOrigin, getEnvBankTransferHint } from "@/lib/env";
import type {
  ClubRuntimeSetting,
  PaymentClaim,
  Player,
  PlayerSessionBalance,
  SessionAttendance,
  SessionCreditLedger,
  SessionLeaveRequest,
  SessionPackage,
  Team,
  TeamMembership,
} from "@/lib/supabase/database.types";
import { isPrimaryPurchasePackage } from "@/lib/credits/packages";
import { contributionFromDebits, parentContributionFromClaims } from "@/lib/credits/packages";

export type PaymentClaimWithDetails = PaymentClaim & {
  player: Player | null;
  package: SessionPackage | null;
};

export type SessionAttendanceWithPlayer = SessionAttendance & {
  player: Player | null;
};

export type SessionLeaveRequestWithRegistration = SessionLeaveRequest;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function listActivePackages(): Promise<SessionPackage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("session_packages")
    .select("*")
    .eq("active", true)
    .order("age_band")
    .order("credits");

  if (error) {
    console.error("listActivePackages", error.message);
    return [];
  }
  return data ?? [];
}

export async function listPrimaryPackages(): Promise<SessionPackage[]> {
  const rows = await listActivePackages();
  return rows.filter((row) => isPrimaryPurchasePackage(row.credits));
}

export async function listPackagesForAdmin(): Promise<SessionPackage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("session_packages")
    .select("*")
    .order("age_band")
    .order("credits");

  if (error) {
    console.error("listPackagesForAdmin", error.message);
    return [];
  }
  return data ?? [];
}

export async function listBalancesForPlayers(
  playerIds: string[],
): Promise<PlayerSessionBalance[]> {
  if (playerIds.length === 0) {
    return [];
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("player_session_balances")
    .select("*")
    .in("player_id", playerIds);

  if (error) {
    console.error("listBalancesForPlayers", error.message);
    return [];
  }
  return data ?? [];
}

export async function listAttendedCounts(
  playerIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (playerIds.length === 0) {
    return counts;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("session_attendance")
    .select("player_id, status")
    .in("player_id", playerIds)
    .eq("status", "present");

  if (error) {
    console.error("listAttendedCounts", error.message);
    return counts;
  }
  for (const row of data ?? []) {
    counts.set(row.player_id, (counts.get(row.player_id) ?? 0) + 1);
  }
  return counts;
}

export async function listOwnPaymentClaims(): Promise<PaymentClaimWithDetails[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_claims")
    .select("*, players(*), session_packages(*)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listOwnPaymentClaims", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const { players, session_packages, ...claim } = row as Record<string, unknown> & PaymentClaim;
    return {
      ...(claim as PaymentClaim),
      player: one(players as Player | Player[] | null),
      package: one(session_packages as SessionPackage | SessionPackage[] | null),
    };
  });
}

export async function listPaymentClaimsForAdmin(): Promise<PaymentClaimWithDetails[]> {
  return listOwnPaymentClaims();
}

export async function listAttendanceForSession(
  sessionId: string,
): Promise<SessionAttendanceWithPlayer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("session_attendance")
    .select("*, players(*)")
    .eq("session_id", sessionId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("listAttendanceForSession", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const { players, ...attendance } = row as Record<string, unknown> & SessionAttendance;
    return {
      ...(attendance as SessionAttendance),
      player: one(players as Player | Player[] | null),
    };
  });
}

export async function listLeaveRequestsForSession(
  sessionId: string,
): Promise<(SessionLeaveRequest & { player_id: string; registration_id: string })[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("session_leave_requests")
    .select("*, session_registrations!inner(session_id, player_id)")
    .eq("session_registrations.session_id", sessionId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listLeaveRequestsForSession", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const nested = row.session_registrations as
      | { session_id: string; player_id: string }
      | { session_id: string; player_id: string }[]
      | null;
    const reg = Array.isArray(nested) ? nested[0] : nested;
    return {
      ...(row as unknown as SessionLeaveRequest),
      player_id: reg?.player_id ?? "",
      registration_id: row.registration_id as string,
    };
  });
}

export async function listLeaveRequestsForRegistrations(
  registrationIds: string[],
): Promise<SessionLeaveRequest[]> {
  if (registrationIds.length === 0) {
    return [];
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("session_leave_requests")
    .select("*")
    .in("registration_id", registrationIds)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listLeaveRequestsForRegistrations", error.message);
    return [];
  }
  return data ?? [];
}

export type TeamRosterPlayer = {
  player: Player;
  membership: TeamMembership;
  team: Team;
};

export async function listActiveRosterForTeam(teamId: string): Promise<TeamRosterPlayer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_memberships")
    .select("*, players(*), teams(*)")
    .eq("team_id", teamId)
    .eq("status", "active");

  if (error) {
    console.error("listActiveRosterForTeam", error.message);
    return [];
  }

  const rows: TeamRosterPlayer[] = [];
  for (const row of data ?? []) {
    const player = one(row.players as Player | Player[] | null);
    const team = one(row.teams as Team | Team[] | null);
    if (!player || !team) {
      continue;
    }
    const { players, teams, ...membership } = row;
    void players;
    void teams;
    rows.push({
      player,
      team,
      membership: membership as TeamMembership,
    });
  }
  return rows.sort((a, b) => a.membership.jersey_number - b.membership.jersey_number);
}

export async function getBankTransferHint(): Promise<string> {
  const envHint = getEnvBankTransferHint();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("club_runtime_settings")
    .select("value")
    .eq("key", "bank_transfer_hint")
    .maybeSingle();

  if (error) {
    console.error("getBankTransferHint", error.message);
    return envHint;
  }
  const dbHint = (data as ClubRuntimeSetting | null)?.value?.trim() ?? "";
  return dbHint || envHint;
}

export function publicAppOrigin(): string {
  return getAppOrigin();
}

export type CreditTotals = {
  parentContributionTwd: number;
  playerContributionTwd: number;
  approvedClaimCount: number;
  debitCount: number;
};

export async function listCreditTotalsForAdmin(): Promise<CreditTotals> {
  const supabase = await createClient();
  const empty: CreditTotals = {
    parentContributionTwd: 0,
    playerContributionTwd: 0,
    approvedClaimCount: 0,
    debitCount: 0,
  };

  const [claimsResult, ledgerResult] = await Promise.all([
    supabase
      .from("payment_claims")
      .select("status, session_packages(price_twd)")
      .eq("status", "approved"),
    supabase
      .from("session_credit_ledger")
      .select("entry_type, amount, unit_cost_twd")
      .in("entry_type", ["attend_debit", "no_show_debit", "match_debit"]),
  ]);

  if (claimsResult.error) {
    console.error("listCreditTotalsForAdmin claims", claimsResult.error.message);
    return empty;
  }
  if (ledgerResult.error) {
    console.error("listCreditTotalsForAdmin ledger", ledgerResult.error.message);
  }

  const claimAmounts: number[] = [];
  for (const row of claimsResult.data ?? []) {
    const pkg = one(row.session_packages as { price_twd: number } | { price_twd: number }[] | null);
    if (pkg) {
      claimAmounts.push(pkg.price_twd);
    }
  }

  const debitRows: { credits: number; unitCostTwd: number }[] = [];
  for (const row of (ledgerResult.data ?? []) as Pick<
    SessionCreditLedger,
    "amount" | "unit_cost_twd"
  >[]) {
    debitRows.push({
      credits: Math.abs(row.amount),
      unitCostTwd: Number(row.unit_cost_twd ?? 0),
    });
  }

  return {
    parentContributionTwd: parentContributionFromClaims(claimAmounts),
    playerContributionTwd: contributionFromDebits(debitRows),
    approvedClaimCount: claimAmounts.length,
    debitCount: debitRows.length,
  };
}

export async function listPlayersForAdminCredits(): Promise<Player[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("status", "active")
    .order("name_en_family")
    .order("name_en_given");

  if (error) {
    console.error("listPlayersForAdminCredits", error.message);
    return [];
  }
  return data ?? [];
}
