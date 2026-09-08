/**
 * Stage D admin ops dashboard (pure).
 *
 * Locked money math (do not invent a price list):
 * 1. Approved remittance = sum of approved claim package prices in the
 *    selected Asia/Taipei period (pending/rejected excluded). Same helper as
 *    Credit admin 「家長貢獻」: parentContributionFromClaims.
 * 2. Consumed value = session-credit debit entries in the period × that
 *    entry’s unit_cost_twd. Same helper as Credit admin 「球員貢獻」:
 *    contributionFromDebits (abs(amount) × unit cost). Purchase / adjust /
 *    reversal are not consumed.
 * 3. Period remaining (待履行 comparison) = remittance − consumed.
 *    Outstanding credit liability = current remaining credits × each
 *    player’s avg_unit_cost_twd (snapshot, not period-sliced).
 *
 * Attendance rate = present / marked (present + excused + unexcused).
 * Unmarked registrations and soft-deleted sessions are omitted.
 * No parent phones / contact PII.
 */

import {
  contributionFromDebits,
  parentContributionFromClaims,
} from "../credits/packages.ts";
import type { AttendanceStatus, DebitEntryType } from "../credits/debit-rules.ts";
import type { PaymentClaimStatus, TeamKind } from "../supabase/database.types.ts";
import { parseUuid } from "./parse.ts";
import { clubRangeToTimestamptz } from "./session-calendar.ts";
import {
  addCalendarDays,
  formatCalendarDate,
  parseCalendarDateParts,
} from "./session-recurrence.ts";
import { toDateTimeLocalInput } from "./session-time.ts";
import { isSoftDeleted } from "./soft-delete.ts";

export const DASHBOARD_DEBIT_TYPES: readonly DebitEntryType[] = [
  "attend_debit",
  "no_show_debit",
  "match_debit",
];

export type DashboardFilters = {
  dateFrom: string;
  dateTo: string;
  ageSquadId: string | null;
};

export type DashboardClaimRow = {
  status: PaymentClaimStatus;
  amountTwd: number;
  reviewedAt: string | null;
  createdAt: string;
  playerId: string;
};

export type DashboardDebitRow = {
  entryType: string;
  credits: number;
  unitCostTwd: number;
  createdAt: string;
  playerId: string;
};

export type DashboardBalanceRow = {
  playerId: string;
  creditsAvailable: number;
  avgUnitCostTwd: number;
};

export type DashboardAttendanceRow = {
  status: AttendanceStatus;
  sessionStartsAt: string;
  sessionDeletedAt: string | null;
  sessionTeamId: string;
  sessionTeamKind: TeamKind | null;
  sessionTeamName: string | null;
  playerId: string;
};

export type AgeSquadMembership = {
  playerId: string;
  squadId: string;
  squadName: string;
};

export type DashboardSquadAttendance = {
  squadId: string | null;
  squadName: string | null;
  present: number;
  excused: number;
  unexcused: number;
  marked: number;
  rate: number | null;
};

export type DashboardMonthAttendance = {
  yearMonth: string;
  present: number;
  marked: number;
  rate: number | null;
};

export type DashboardSnapshot = {
  filters: DashboardFilters;
  approvedRemittanceTwd: number;
  approvedClaimCount: number;
  consumedValueTwd: number;
  debitCount: number;
  debitCredits: number;
  periodRemainingTwd: number;
  outstandingLiabilityTwd: number;
  outstandingCredits: number;
  attendancePresent: number;
  attendanceMarked: number;
  attendanceRate: number | null;
  perSquad: DashboardSquadAttendance[];
  monthly: DashboardMonthAttendance[];
};

export function isDashboardDebitType(value: string): value is DebitEntryType {
  return (DASHBOARD_DEBIT_TYPES as readonly string[]).includes(value);
}

export function defaultDashboardDateRange(now = new Date()): { from: string; to: string } {
  const today = toDateTimeLocalInput(now.toISOString()).slice(0, 10);
  const parts = parseCalendarDateParts(today);
  if (!parts) {
    return { from: today, to: today };
  }
  const from = formatCalendarDate(parts.year, parts.month, 1);
  const nextMonth =
    parts.month === 12
      ? formatCalendarDate(parts.year + 1, 1, 1)
      : formatCalendarDate(parts.year, parts.month + 1, 1);
  const to = addCalendarDays(nextMonth, -1) ?? from;
  return { from, to };
}

export function dashboardDateBounds(
  filters: Pick<DashboardFilters, "dateFrom" | "dateTo">,
): { from: string; toExclusive: string } | null {
  if (!filters.dateFrom || !filters.dateTo) {
    return null;
  }
  return clubRangeToTimestamptz(filters.dateFrom, filters.dateTo);
}

export function dashboardInstantInRange(iso: string, from: string, toExclusive: string): boolean {
  const t = Date.parse(iso);
  const a = Date.parse(from);
  const b = Date.parse(toExclusive);
  if (Number.isNaN(t) || Number.isNaN(a) || Number.isNaN(b)) {
    return false;
  }
  return t >= a && t < b;
}

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function parseDashboardSearchParams(
  params: {
    from?: string | string[];
    to?: string | string[];
    squad?: string | string[];
  },
  now = new Date(),
): DashboardFilters {
  const defaults = defaultDashboardDateRange(now);
  const fromRaw = firstParam(params.from);
  const toRaw = firstParam(params.to);
  const fromOk = Boolean(fromRaw && parseCalendarDateParts(fromRaw));
  const toOk = Boolean(toRaw && parseCalendarDateParts(toRaw));
  const both = fromOk && toOk && fromRaw <= toRaw;
  return {
    dateFrom: both ? fromRaw : defaults.from,
    dateTo: both ? toRaw : defaults.to,
    ageSquadId: parseUuid(firstParam(params.squad)),
  };
}

/** Approved remittance counts at review time; never-reviewed rows fall back to created_at. */
export function claimInstantForPeriod(row: Pick<DashboardClaimRow, "reviewedAt" | "createdAt">): string {
  return row.reviewedAt ?? row.createdAt;
}

export function attendanceRate(present: number, marked: number): number | null {
  if (!Number.isFinite(present) || !Number.isFinite(marked) || marked <= 0) {
    return null;
  }
  return present / marked;
}

export function clubYearMonth(iso: string): string | null {
  const local = toDateTimeLocalInput(iso);
  return local.length >= 7 ? local.slice(0, 7) : null;
}

function playerSquadId(
  playerId: string,
  memberships: readonly AgeSquadMembership[],
): string | null {
  return memberships.find((row) => row.playerId === playerId)?.squadId ?? null;
}

function matchesPlayerSquadFilter(
  playerId: string,
  ageSquadId: string | null,
  memberships: readonly AgeSquadMembership[],
): boolean {
  if (!ageSquadId) {
    return true;
  }
  return playerSquadId(playerId, memberships) === ageSquadId;
}

export function resolvedAttendanceSquad(
  row: Pick<
    DashboardAttendanceRow,
    "sessionTeamId" | "sessionTeamKind" | "sessionTeamName" | "playerId"
  >,
  memberships: readonly AgeSquadMembership[],
): { squadId: string | null; squadName: string | null } {
  if (row.sessionTeamKind === "age_squad") {
    return { squadId: row.sessionTeamId, squadName: row.sessionTeamName };
  }
  const membership = memberships.find((item) => item.playerId === row.playerId);
  return {
    squadId: membership?.squadId ?? null,
    squadName: membership?.squadName ?? null,
  };
}

function emptyCounts(): Omit<DashboardSquadAttendance, "squadId" | "squadName" | "rate"> {
  return { present: 0, excused: 0, unexcused: 0, marked: 0 };
}

function applyAttendanceStatus(
  counts: Omit<DashboardSquadAttendance, "squadId" | "squadName" | "rate">,
  status: AttendanceStatus,
): void {
  counts.marked += 1;
  if (status === "present") {
    counts.present += 1;
  } else if (status === "excused_absent") {
    counts.excused += 1;
  } else {
    counts.unexcused += 1;
  }
}

export function aggregateOpsDashboard(input: {
  filters: DashboardFilters;
  claims: readonly DashboardClaimRow[];
  debits: readonly DashboardDebitRow[];
  balances: readonly DashboardBalanceRow[];
  attendance: readonly DashboardAttendanceRow[];
  memberships: readonly AgeSquadMembership[];
}): DashboardSnapshot {
  const bounds = dashboardDateBounds(input.filters);
  const { ageSquadId } = input.filters;
  const memberships = input.memberships;

  const approved = input.claims.filter((row) => {
    if (row.status !== "approved") {
      return false;
    }
    if (bounds && !dashboardInstantInRange(claimInstantForPeriod(row), bounds.from, bounds.toExclusive)) {
      return false;
    }
    return matchesPlayerSquadFilter(row.playerId, ageSquadId, memberships);
  });

  const debitRows = input.debits.filter((row) => {
    if (!isDashboardDebitType(row.entryType)) {
      return false;
    }
    if (bounds && !dashboardInstantInRange(row.createdAt, bounds.from, bounds.toExclusive)) {
      return false;
    }
    return matchesPlayerSquadFilter(row.playerId, ageSquadId, memberships);
  });

  const balances = input.balances.filter((row) =>
    matchesPlayerSquadFilter(row.playerId, ageSquadId, memberships),
  );

  const markedAttendance = input.attendance.filter((row) => {
    if (isSoftDeleted({ deleted_at: row.sessionDeletedAt })) {
      return false;
    }
    if (bounds && !dashboardInstantInRange(row.sessionStartsAt, bounds.from, bounds.toExclusive)) {
      return false;
    }
    const squad = resolvedAttendanceSquad(row, memberships);
    if (ageSquadId && squad.squadId !== ageSquadId) {
      return false;
    }
    return true;
  });

  const approvedRemittanceTwd = parentContributionFromClaims(approved.map((row) => row.amountTwd));
  const consumedValueTwd = contributionFromDebits(
    debitRows.map((row) => ({ credits: row.credits, unitCostTwd: row.unitCostTwd })),
  );
  const outstandingLiabilityTwd = contributionFromDebits(
    balances.map((row) => ({
      credits: row.creditsAvailable,
      unitCostTwd: row.avgUnitCostTwd,
    })),
  );

  const overall = emptyCounts();
  const bySquad = new Map<string, DashboardSquadAttendance>();
  const byMonth = new Map<string, { present: number; marked: number }>();

  for (const row of markedAttendance) {
    applyAttendanceStatus(overall, row.status);
    const squad = resolvedAttendanceSquad(row, memberships);
    const key = squad.squadId ?? "";
    const existing = bySquad.get(key) ?? {
      squadId: squad.squadId,
      squadName: squad.squadName,
      ...emptyCounts(),
      rate: null,
    };
    applyAttendanceStatus(existing, row.status);
    bySquad.set(key, existing);

    const month = clubYearMonth(row.sessionStartsAt);
    if (month) {
      const bucket = byMonth.get(month) ?? { present: 0, marked: 0 };
      bucket.marked += 1;
      if (row.status === "present") {
        bucket.present += 1;
      }
      byMonth.set(month, bucket);
    }
  }

  const perSquad = [...bySquad.values()]
    .map((row) => ({ ...row, rate: attendanceRate(row.present, row.marked) }))
    .sort((a, b) => {
      if (a.squadId === null && b.squadId !== null) {
        return 1;
      }
      if (a.squadId !== null && b.squadId === null) {
        return -1;
      }
      return (a.squadName ?? "").localeCompare(b.squadName ?? "", "en");
    });

  const monthly = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([yearMonth, row]) => ({
      yearMonth,
      present: row.present,
      marked: row.marked,
      rate: attendanceRate(row.present, row.marked),
    }));

  return {
    filters: input.filters,
    approvedRemittanceTwd,
    approvedClaimCount: approved.length,
    consumedValueTwd,
    debitCount: debitRows.length,
    debitCredits: debitRows.reduce((sum, row) => sum + row.credits, 0),
    periodRemainingTwd: approvedRemittanceTwd - consumedValueTwd,
    outstandingLiabilityTwd,
    outstandingCredits: balances.reduce((sum, row) => sum + row.creditsAvailable, 0),
    attendancePresent: overall.present,
    attendanceMarked: overall.marked,
    attendanceRate: attendanceRate(overall.present, overall.marked),
    perSquad,
    monthly,
  };
}

export function emptyDashboardSnapshot(filters: DashboardFilters): DashboardSnapshot {
  return aggregateOpsDashboard({
    filters,
    claims: [],
    debits: [],
    balances: [],
    attendance: [],
    memberships: [],
  });
}
