/**
 * Stage D admin ops dashboard queries. Reuses existing RLS SELECT (admin-only
 * in the page). No new SQL: claims, ledger, balances, attendance, sessions,
 * and memberships are already granted to admins.
 */

import { canAccessAdmin } from "@/lib/auth/roles";
import { loadSignedInAccount } from "@/lib/auth/session";
import type { AttendanceStatus } from "@/lib/credits/debit-rules";
import type { OrgErrorKey } from "@/lib/org/errors";
import {
  DASHBOARD_DEBIT_TYPES,
  aggregateOpsDashboard,
  dashboardDateBounds,
  emptyDashboardSnapshot,
  type AgeSquadMembership,
  type DashboardAttendanceRow,
  type DashboardBalanceRow,
  type DashboardClaimRow,
  type DashboardDebitRow,
  type DashboardFilters,
  type DashboardSnapshot,
} from "@/lib/org/dashboard";
import type { PaymentClaimStatus, TeamKind } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const PAGE = 1000;
const SOURCE_SCAN_CAP = 25000;

type AdminClient = Awaited<ReturnType<typeof createClient>>;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type QueryResult<T> =
  | { ok: true; rows: T[] }
  | { ok: false; errorKey: OrgErrorKey };

async function fetchPages<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<QueryResult<T>> {
  const rows: T[] = [];
  let from = 0;
  while (from < SOURCE_SCAN_CAP) {
    const page = await fetchPage(from, from + PAGE - 1);
    if (page.error) {
      console.error("dashboard query", page.error.message);
      return { ok: false, errorKey: "generic" };
    }
    const data = page.data ?? [];
    rows.push(...data);
    if (rows.length > SOURCE_SCAN_CAP) {
      return { ok: false, errorKey: "generic" };
    }
    if (data.length < PAGE) {
      break;
    }
    from += PAGE;
  }
  return { ok: true, rows };
}

async function pageRange<T>(
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  return query;
}

export type DashboardLoadResult =
  | { ok: true; snapshot: DashboardSnapshot }
  | { ok: false; errorKey: Extract<OrgErrorKey, "forbidden" | "notConfigured" | "generic"> };

export async function loadOpsDashboard(filters: DashboardFilters): Promise<DashboardLoadResult> {
  const { user, roles } = await loadSignedInAccount();
  if (!user || !canAccessAdmin(roles)) {
    return { ok: false, errorKey: "forbidden" };
  }
  const supabase = await createClient();
  return queryOpsDashboard(supabase, filters);
}

export async function queryOpsDashboard(
  supabase: AdminClient,
  filters: DashboardFilters,
): Promise<DashboardLoadResult> {
  const bounds = dashboardDateBounds(filters);
  if (!bounds) {
    return { ok: true, snapshot: emptyDashboardSnapshot(filters) };
  }

  const [claimsResult, debitsResult, balancesResult, attendanceResult, membershipsResult] =
    await Promise.all([
      loadApprovedClaims(supabase, bounds),
      loadDebits(supabase, bounds),
      loadBalances(supabase),
      loadAttendance(supabase, bounds),
      loadAgeSquadMemberships(supabase),
    ]);

  if (
    !claimsResult.ok ||
    !debitsResult.ok ||
    !balancesResult.ok ||
    !attendanceResult.ok ||
    !membershipsResult.ok
  ) {
    return { ok: false, errorKey: "generic" };
  }

  return {
    ok: true,
    snapshot: aggregateOpsDashboard({
      filters,
      claims: claimsResult.rows,
      debits: debitsResult.rows,
      balances: balancesResult.rows,
      attendance: attendanceResult.rows,
      memberships: membershipsResult.rows,
    }),
  };
}

function mapClaimRow(raw: unknown): (DashboardClaimRow & { id: string }) | null {
  const row = raw as {
    id: string;
    status: PaymentClaimStatus;
    reviewed_at: string | null;
    created_at: string;
    player_id: string;
    session_packages: { price_twd: number } | { price_twd: number }[] | null;
  };
  const pkg = one(row.session_packages);
  if (!pkg) {
    return null;
  }
  return {
    id: row.id,
    status: row.status,
    amountTwd: Number(pkg.price_twd),
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    playerId: row.player_id,
  };
}

async function loadApprovedClaims(
  supabase: AdminClient,
  bounds: { from: string; toExclusive: string },
): Promise<QueryResult<DashboardClaimRow>> {
  const select =
    "id, status, reviewed_at, created_at, player_id, session_packages(price_twd)";
  const [reviewed, legacy] = await Promise.all([
    fetchPages((from, to) =>
      pageRange(
        supabase
          .from("payment_claims")
          .select(select)
          .eq("status", "approved")
          .gte("reviewed_at", bounds.from)
          .lt("reviewed_at", bounds.toExclusive)
          .range(from, to),
      ),
    ),
    fetchPages((from, to) =>
      pageRange(
        supabase
          .from("payment_claims")
          .select(select)
          .eq("status", "approved")
          .is("reviewed_at", null)
          .gte("created_at", bounds.from)
          .lt("created_at", bounds.toExclusive)
          .range(from, to),
      ),
    ),
  ]);
  if (!reviewed.ok) {
    return reviewed;
  }
  if (!legacy.ok) {
    return legacy;
  }

  const rows: DashboardClaimRow[] = [];
  const seen = new Set<string>();
  for (const raw of [...reviewed.rows, ...legacy.rows]) {
    const mapped = mapClaimRow(raw);
    if (!mapped) {
      continue;
    }
    if (seen.has(mapped.id)) {
      continue;
    }
    seen.add(mapped.id);
    rows.push({
      status: mapped.status,
      amountTwd: mapped.amountTwd,
      reviewedAt: mapped.reviewedAt,
      createdAt: mapped.createdAt,
      playerId: mapped.playerId,
    });
  }
  return { ok: true, rows };
}

async function loadDebits(
  supabase: AdminClient,
  bounds: { from: string; toExclusive: string },
): Promise<QueryResult<DashboardDebitRow>> {
  const fetched = await fetchPages((from, to) =>
    pageRange(
      supabase
        .from("session_credit_ledger")
        .select("entry_type, amount, unit_cost_twd, created_at, player_id")
        .in("entry_type", [...DASHBOARD_DEBIT_TYPES])
        .gte("created_at", bounds.from)
        .lt("created_at", bounds.toExclusive)
        .range(from, to),
    ),
  );
  if (!fetched.ok) {
    return fetched;
  }

  return {
    ok: true,
    rows: (fetched.rows as {
      entry_type: string;
      amount: number;
      unit_cost_twd: number | null;
      created_at: string;
      player_id: string;
    }[]).map((row) => ({
      entryType: row.entry_type,
      credits: Math.abs(Number(row.amount)),
      unitCostTwd: Number(row.unit_cost_twd ?? 0),
      createdAt: row.created_at,
      playerId: row.player_id,
    })),
  };
}

async function loadBalances(supabase: AdminClient): Promise<QueryResult<DashboardBalanceRow>> {
  const fetched = await fetchPages((from, to) =>
    pageRange(
      supabase
        .from("player_session_balances")
        .select("player_id, credits_available, avg_unit_cost_twd")
        .range(from, to),
    ),
  );
  if (!fetched.ok) {
    return fetched;
  }
  return {
    ok: true,
    rows: (fetched.rows as {
      player_id: string;
      credits_available: number;
      avg_unit_cost_twd: number;
    }[]).map((row) => ({
      playerId: row.player_id,
      creditsAvailable: Number(row.credits_available),
      avgUnitCostTwd: Number(row.avg_unit_cost_twd),
    })),
  };
}

async function loadAttendance(
  supabase: AdminClient,
  bounds: { from: string; toExclusive: string },
): Promise<QueryResult<DashboardAttendanceRow>> {
  const fetched = await fetchPages((from, to) =>
    pageRange(
      supabase
        .from("session_attendance")
        .select(
          "status, player_id, training_sessions!inner (starts_at, deleted_at, team_id, teams (id, name, kind))",
        )
        .gte("training_sessions.starts_at", bounds.from)
        .lt("training_sessions.starts_at", bounds.toExclusive)
        .is("training_sessions.deleted_at", null)
        .range(from, to),
    ),
  );
  if (!fetched.ok) {
    return fetched;
  }

  const rows: DashboardAttendanceRow[] = [];
  for (const raw of fetched.rows) {
    const row = raw as {
      status: AttendanceStatus;
      player_id: string;
      training_sessions:
        | {
            starts_at: string;
            deleted_at: string | null;
            team_id: string;
            teams: { id: string; name: string; kind: TeamKind } | { id: string; name: string; kind: TeamKind }[] | null;
          }
        | {
            starts_at: string;
            deleted_at: string | null;
            team_id: string;
            teams: { id: string; name: string; kind: TeamKind } | { id: string; name: string; kind: TeamKind }[] | null;
          }[]
        | null;
    };
    const session = one(row.training_sessions);
    if (!session) {
      continue;
    }
    const team = one(session.teams);
    rows.push({
      status: row.status,
      sessionStartsAt: session.starts_at,
      sessionDeletedAt: session.deleted_at,
      sessionTeamId: session.team_id,
      sessionTeamKind: team?.kind ?? null,
      sessionTeamName: team?.name ?? null,
      playerId: row.player_id,
    });
  }
  return { ok: true, rows };
}

async function loadAgeSquadMemberships(
  supabase: AdminClient,
): Promise<QueryResult<AgeSquadMembership>> {
  const fetched = await fetchPages((from, to) =>
    pageRange(
      supabase
        .from("team_memberships")
        .select("player_id, teams!inner (id, name, kind)")
        .eq("status", "active")
        .eq("teams.kind", "age_squad")
        .range(from, to),
    ),
  );
  if (!fetched.ok) {
    return fetched;
  }

  const rows: AgeSquadMembership[] = [];
  for (const raw of fetched.rows) {
    const row = raw as {
      player_id: string;
      teams: { id: string; name: string; kind: TeamKind } | { id: string; name: string; kind: TeamKind }[] | null;
    };
    const team = one(row.teams);
    if (!team) {
      continue;
    }
    rows.push({
      playerId: row.player_id,
      squadId: team.id,
      squadName: team.name,
    });
  }
  return { ok: true, rows };
}
