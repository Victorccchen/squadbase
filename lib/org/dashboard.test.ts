import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAccessAdmin } from "../auth/roles.ts";
import {
  contributionFromDebits,
  parentContributionFromClaims,
} from "../credits/packages.ts";
import {
  aggregateOpsDashboard,
  claimInstantForPeriod,
  clubYearMonth,
  parseDashboardSearchParams,
  resolvedAttendanceSquad,
  type AgeSquadMembership,
  type DashboardAttendanceRow,
  type DashboardBalanceRow,
  type DashboardClaimRow,
  type DashboardDebitRow,
  type DashboardFilters,
} from "./dashboard.ts";

const SQUAD_U8 = "11111111-1111-4111-8111-111111111111";
const SQUAD_U10 = "22222222-2222-4222-8222-222222222222";
const PLAYER_U8 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLAYER_U10 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const filters: DashboardFilters = {
  dateFrom: "2026-09-01",
  dateTo: "2026-09-30",
  ageSquadId: null,
};

const memberships: AgeSquadMembership[] = [
  { playerId: PLAYER_U8, squadId: SQUAD_U8, squadName: "梯隊 U8" },
  { playerId: PLAYER_U10, squadId: SQUAD_U10, squadName: "梯隊 U10" },
];

function claim(overrides: Partial<DashboardClaimRow> & Pick<DashboardClaimRow, "status" | "amountTwd">): DashboardClaimRow {
  return {
    reviewedAt: "2026-09-10T12:00:00+08:00",
    createdAt: "2026-09-09T12:00:00+08:00",
    playerId: PLAYER_U8,
    ...overrides,
  };
}

function debit(overrides: Partial<DashboardDebitRow> = {}): DashboardDebitRow {
  return {
    entryType: "attend_debit",
    credits: 1,
    unitCostTwd: 350,
    createdAt: "2026-09-12T19:00:00+08:00",
    playerId: PLAYER_U8,
    ...overrides,
  };
}

function attendance(
  overrides: Partial<DashboardAttendanceRow> & Pick<DashboardAttendanceRow, "status">,
): DashboardAttendanceRow {
  return {
    sessionStartsAt: "2026-09-08T19:00:00+08:00",
    sessionDeletedAt: null,
    sessionTeamId: SQUAD_U8,
    sessionTeamKind: "age_squad",
    sessionTeamName: "梯隊 U8",
    playerId: PLAYER_U8,
    ...overrides,
  };
}

describe("TD-1 approved claims only", () => {
  it("sums approved package prices and ignores pending/rejected in the same window", () => {
    const snapshot = aggregateOpsDashboard({
      filters,
      memberships,
      claims: [
        claim({ status: "approved", amountTwd: 3500 }),
        claim({ status: "approved", amountTwd: 4800, playerId: PLAYER_U10 }),
        claim({ status: "pending", amountTwd: 10000 }),
        claim({ status: "rejected", amountTwd: 12000 }),
      ],
      debits: [],
      balances: [],
      attendance: [],
    });
    assert.equal(snapshot.approvedRemittanceTwd, parentContributionFromClaims([3500, 4800]));
    assert.equal(snapshot.approvedClaimCount, 2);
    assert.equal(snapshot.approvedRemittanceTwd, 8300);
  });

  it("uses reviewed_at for the period window (Taipei calendar days)", () => {
    const snapshot = aggregateOpsDashboard({
      filters,
      memberships,
      claims: [
        claim({
          status: "approved",
          amountTwd: 3500,
          reviewedAt: "2026-09-30T23:59:00+08:00",
        }),
        claim({
          status: "approved",
          amountTwd: 4800,
          reviewedAt: "2026-10-01T00:00:00+08:00",
        }),
        claim({
          status: "approved",
          amountTwd: 7000,
          reviewedAt: "2026-08-31T23:59:00+08:00",
        }),
      ],
      debits: [],
      balances: [],
      attendance: [],
    });
    assert.equal(snapshot.approvedRemittanceTwd, 3500);
    assert.equal(snapshot.approvedClaimCount, 1);
  });

  it("falls back to created_at when reviewed_at is null", () => {
    assert.equal(
      claimInstantForPeriod({ reviewedAt: null, createdAt: "2026-09-02T00:00:00+08:00" }),
      "2026-09-02T00:00:00+08:00",
    );
    const snapshot = aggregateOpsDashboard({
      filters,
      memberships,
      claims: [
        claim({
          status: "approved",
          amountTwd: 3500,
          reviewedAt: null,
          createdAt: "2026-09-05T10:00:00+08:00",
        }),
      ],
      debits: [],
      balances: [],
      attendance: [],
    });
    assert.equal(snapshot.approvedRemittanceTwd, 3500);
  });
});

describe("TD-2 debit conversion matches contribution rules", () => {
  it("uses contributionFromDebits (credits × unit_cost_twd) for attend/no-show/match only", () => {
    const debitRows = [
      debit({ credits: 1, unitCostTwd: 350 }),
      debit({ entryType: "no_show_debit", credits: 2, unitCostTwd: 350 }),
      debit({
        entryType: "match_debit",
        credits: 1,
        unitCostTwd: 480,
        playerId: PLAYER_U10,
      }),
      debit({ entryType: "purchase", credits: 10, unitCostTwd: 350 }),
      debit({ entryType: "admin_adjust", credits: 3, unitCostTwd: 350 }),
      debit({ entryType: "reversal", credits: 1, unitCostTwd: 350 }),
    ];
    const snapshot = aggregateOpsDashboard({
      filters,
      memberships,
      claims: [],
      debits: debitRows,
      balances: [],
      attendance: [],
    });
    const expected = contributionFromDebits([
      { credits: 1, unitCostTwd: 350 },
      { credits: 2, unitCostTwd: 350 },
      { credits: 1, unitCostTwd: 480 },
    ]);
    assert.equal(snapshot.consumedValueTwd, expected);
    assert.equal(snapshot.consumedValueTwd, 1530);
    assert.equal(snapshot.debitCount, 3);
    assert.equal(snapshot.debitCredits, 4);
  });

  it("drops debits outside the Taipei period", () => {
    const snapshot = aggregateOpsDashboard({
      filters,
      memberships,
      claims: [],
      debits: [
        debit({ createdAt: "2026-09-01T00:00:00+08:00" }),
        debit({ createdAt: "2026-10-01T00:00:00+08:00" }),
      ],
      balances: [],
      attendance: [],
    });
    assert.equal(snapshot.consumedValueTwd, 350);
    assert.equal(snapshot.debitCount, 1);
  });
});

describe("TD-3 obligation math", () => {
  it("period remaining is remittance minus consumed; liability is remaining credits × avg unit cost", () => {
    const balances: DashboardBalanceRow[] = [
      { playerId: PLAYER_U8, creditsAvailable: 8, avgUnitCostTwd: 350 },
      { playerId: PLAYER_U10, creditsAvailable: 5, avgUnitCostTwd: 480 },
    ];
    const snapshot = aggregateOpsDashboard({
      filters,
      memberships,
      claims: [
        claim({ status: "approved", amountTwd: 3500 }),
        claim({ status: "approved", amountTwd: 4800, playerId: PLAYER_U10 }),
      ],
      debits: [
        debit({ credits: 1, unitCostTwd: 350 }),
        debit({ credits: 2, unitCostTwd: 480, playerId: PLAYER_U10 }),
      ],
      balances,
      attendance: [],
    });
    assert.equal(snapshot.approvedRemittanceTwd, 8300);
    assert.equal(snapshot.consumedValueTwd, 350 + 960);
    assert.equal(snapshot.periodRemainingTwd, 8300 - (350 + 960));
    assert.equal(
      snapshot.outstandingLiabilityTwd,
      contributionFromDebits([
        { credits: 8, unitCostTwd: 350 },
        { credits: 5, unitCostTwd: 480 },
      ]),
    );
    assert.equal(snapshot.outstandingLiabilityTwd, 8 * 350 + 5 * 480);
    assert.equal(snapshot.outstandingCredits, 13);
  });

  it("age_squad filter applies to remittance, consumption, and current liability", () => {
    const snapshot = aggregateOpsDashboard({
      filters: { ...filters, ageSquadId: SQUAD_U8 },
      memberships,
      claims: [
        claim({ status: "approved", amountTwd: 3500, playerId: PLAYER_U8 }),
        claim({ status: "approved", amountTwd: 4800, playerId: PLAYER_U10 }),
      ],
      debits: [
        debit({ playerId: PLAYER_U8 }),
        debit({ playerId: PLAYER_U10, unitCostTwd: 480 }),
      ],
      balances: [
        { playerId: PLAYER_U8, creditsAvailable: 8, avgUnitCostTwd: 350 },
        { playerId: PLAYER_U10, creditsAvailable: 5, avgUnitCostTwd: 480 },
      ],
      attendance: [],
    });
    assert.equal(snapshot.approvedRemittanceTwd, 3500);
    assert.equal(snapshot.consumedValueTwd, 350);
    assert.equal(snapshot.periodRemainingTwd, 3150);
    assert.equal(snapshot.outstandingLiabilityTwd, 8 * 350);
    assert.equal(snapshot.outstandingCredits, 8);
  });
});

describe("TD-4 per-squad attendance", () => {
  it("computes overall and per-梯隊 rates from marked rows only", () => {
    const snapshot = aggregateOpsDashboard({
      filters,
      memberships,
      claims: [],
      debits: [],
      balances: [],
      attendance: [
        attendance({ status: "present" }),
        attendance({ status: "present", sessionStartsAt: "2026-09-10T19:00:00+08:00" }),
        attendance({ status: "excused_absent", sessionStartsAt: "2026-09-15T19:00:00+08:00" }),
        attendance({
          status: "present",
          sessionTeamId: SQUAD_U10,
          sessionTeamName: "梯隊 U10",
          playerId: PLAYER_U10,
        }),
        attendance({
          status: "unexcused_absent",
          sessionTeamId: SQUAD_U10,
          sessionTeamName: "梯隊 U10",
          playerId: PLAYER_U10,
          sessionStartsAt: "2026-09-20T19:00:00+08:00",
        }),
        attendance({
          status: "present",
          sessionStartsAt: "2026-10-02T19:00:00+08:00",
        }),
        attendance({
          status: "present",
          sessionDeletedAt: "2026-09-09T00:00:00+08:00",
          sessionStartsAt: "2026-09-08T18:00:00+08:00",
        }),
      ],
    });
    assert.equal(snapshot.attendancePresent, 3);
    assert.equal(snapshot.attendanceMarked, 5);
    assert.equal(snapshot.attendanceRate, 3 / 5);
    assert.equal(snapshot.perSquad.length, 2);
    const u8 = snapshot.perSquad.find((row) => row.squadId === SQUAD_U8);
    const u10 = snapshot.perSquad.find((row) => row.squadId === SQUAD_U10);
    assert.equal(u8?.present, 2);
    assert.equal(u8?.excused, 1);
    assert.equal(u8?.marked, 3);
    assert.equal(u8?.rate, 2 / 3);
    assert.equal(u10?.present, 1);
    assert.equal(u10?.unexcused, 1);
    assert.equal(u10?.marked, 2);
    assert.equal(u10?.rate, 0.5);
  });

  it("groups 隊伍 (match) attendance by the player’s current 梯隊", () => {
    const matchRow = attendance({
      status: "present",
      sessionTeamId: "33333333-3333-4333-8333-333333333333",
      sessionTeamKind: "competition_team",
      sessionTeamName: "Futuro U8",
      playerId: PLAYER_U8,
    });
    assert.deepEqual(resolvedAttendanceSquad(matchRow, memberships), {
      squadId: SQUAD_U8,
      squadName: "梯隊 U8",
    });
    const snapshot = aggregateOpsDashboard({
      filters: { ...filters, ageSquadId: SQUAD_U8 },
      memberships,
      claims: [],
      debits: [],
      balances: [],
      attendance: [
        matchRow,
        attendance({
          status: "present",
          sessionTeamId: SQUAD_U10,
          sessionTeamKind: "age_squad",
          sessionTeamName: "梯隊 U10",
          playerId: PLAYER_U10,
        }),
      ],
    });
    assert.equal(snapshot.attendanceMarked, 1);
    assert.equal(snapshot.perSquad[0]?.squadId, SQUAD_U8);
  });

  it("builds a monthly trend from session start Asia/Taipei month", () => {
    const snapshot = aggregateOpsDashboard({
      filters: { dateFrom: "2026-08-01", dateTo: "2026-09-30", ageSquadId: null },
      memberships,
      claims: [],
      debits: [],
      balances: [],
      attendance: [
        attendance({ status: "present", sessionStartsAt: "2026-08-20T19:00:00+08:00" }),
        attendance({ status: "unexcused_absent", sessionStartsAt: "2026-08-27T19:00:00+08:00" }),
        attendance({ status: "present", sessionStartsAt: "2026-09-08T19:00:00+08:00" }),
      ],
    });
    assert.equal(clubYearMonth("2026-08-20T19:00:00+08:00"), "2026-08");
    assert.equal(snapshot.monthly.length, 2);
    assert.equal(snapshot.monthly[0]?.yearMonth, "2026-08");
    assert.equal(snapshot.monthly[0]?.rate, 0.5);
    assert.equal(snapshot.monthly[1]?.yearMonth, "2026-09");
    assert.equal(snapshot.monthly[1]?.rate, 1);
  });
});

describe("TD-5 parent/coach denied", () => {
  it("uses the same admin gate as other /app/admin pages", () => {
    assert.equal(canAccessAdmin(["parent"]), false);
    assert.equal(canAccessAdmin(["coach"]), false);
    assert.equal(canAccessAdmin(["parent", "coach"]), false);
    assert.equal(canAccessAdmin(["player"]), false);
    assert.equal(canAccessAdmin([]), false);
    assert.equal(canAccessAdmin(["admin"]), true);
    assert.equal(canAccessAdmin(["parent", "admin"]), true);
  });
});

describe("dashboard search params", () => {
  it("defaults to the current Taipei calendar month and optional squad uuid", () => {
    const parsed = parseDashboardSearchParams(
      { from: "2026-09-01", to: "2026-09-30", squad: SQUAD_U8 },
      new Date("2026-09-15T00:00:00+08:00"),
    );
    assert.deepEqual(parsed, {
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      ageSquadId: SQUAD_U8,
    });
    const fallback = parseDashboardSearchParams(
      { from: "nope", to: "2026-09-30" },
      new Date("2026-09-15T04:00:00+08:00"),
    );
    assert.equal(fallback.dateFrom, "2026-09-01");
    assert.equal(fallback.dateTo, "2026-09-30");
    assert.equal(fallback.ageSquadId, null);
  });
});
