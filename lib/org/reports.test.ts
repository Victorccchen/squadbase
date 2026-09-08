import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canAccessAdmin } from "../auth/roles.ts";
import { parseCsv } from "./import-csv.ts";
import { parseXlsxTable } from "./import-xlsx-read.ts";
import type { ReportCopy, ReportFilters, ReportSessionRef } from "./reports.ts";
import {
  REPORT_ROW_CAP,
  attendanceTable,
  encodeReportFile,
  filterAttendanceRows,
  filterLedgerRows,
  filterMatchRosterRows,
  filterRegistrationRows,
  formatExportStamp,
  ledgerTable,
  matchRosterTable,
  parseReportFilters,
  registrationsTable,
  reportCapError,
  reportFilename,
  tableHasPiiHeaders,
} from "./reports.ts";

const PLAYER = {
  name_zh: "小凱",
  name_en_given: "Kai",
  name_en_family: "Chen",
  name_ja: "カイ",
};

const SQUAD_ID = "11111111-1111-4111-8111-111111111111";
const TEAM_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DELETED_SESSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function copy(): ReportCopy {
  return {
    columns: {
      title: "Title",
      date: "Date",
      kind: "Kind",
      unit: "Unit",
      player: "Player",
      jersey: "Jersey",
      attendanceStatus: "Attendance",
      creditsDebited: "Credits debited",
      leaveNote: "Leave note",
      registrationStatus: "Registration status",
      parentNote: "Parent note",
      registeredAt: "Registered at",
      hasQa: "Has Q&A",
      time: "Time",
      ledgerType: "Type",
      amount: "Amount",
      relatedSession: "Related session",
      actorRole: "Actor role",
      opponent: "Opponent",
      published: "Publish status",
      publicStatus: "Match status",
    },
    kinds: {
      regular: "Regular",
      special: "Special",
      cup: "Cup",
      league: "League",
      friendly: "Friendly",
    },
    attendance: {
      present: "Present",
      excused_absent: "Excused absent",
      unexcused_absent: "Unexcused absent",
    },
    attendanceUnmarked: "Not marked",
    registrationStatus: { registered: "Registered", cancelled: "Cancelled" },
    ledgerTypes: {
      purchase: "Purchase",
      attend_debit: "Attend debit",
      no_show_debit: "No-show debit",
      match_debit: "Match debit",
      admin_adjust: "Admin adjust",
      reversal: "Reversal",
    },
    actorRoles: { parent: "Parent", coach: "Coach", admin: "Admin", player: "Player" },
    actorUnknown: "—",
    publicStatus: { scheduled: "Scheduled", completed: "Completed", cancelled: "Cancelled" },
    published: "Published",
    unpublished: "Unpublished",
    yes: "Yes",
    no: "No",
    opponentTbd: "TBD",
  };
}

function filters(overrides: Partial<ReportFilters> = {}): ReportFilters {
  return {
    reportType: "attendance",
    format: "csv",
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
    kinds: [],
    ageSquadIds: [],
    competitionTeamIds: [],
    includeDeleted: false,
    sessionId: null,
    locale: "en",
    ...overrides,
  };
}

function session(
  overrides: Partial<ReportSessionRef> & Pick<ReportSessionRef, "id" | "kind" | "starts_at" | "team_id">,
): ReportSessionRef {
  return {
    title: "Regular U8",
    team_name: "梯隊 U8",
    team_kind: "age_squad",
    deleted_at: null,
    ...overrides,
  };
}

const IN_WINDOW = session({
  id: SESSION_A,
  kind: "regular",
  starts_at: "2026-09-08T19:00:00+08:00",
  team_id: SQUAD_ID,
});
const OUT_WINDOW = session({
  id: SESSION_B,
  title: "October session",
  kind: "regular",
  starts_at: "2026-10-01T19:00:00+08:00",
  team_id: SQUAD_ID,
});
const DELETED = session({
  id: DELETED_SESSION,
  title: "Deleted session",
  kind: "regular",
  starts_at: "2026-09-15T19:00:00+08:00",
  team_id: SQUAD_ID,
  deleted_at: "2026-09-16T00:00:00+08:00",
});
const MATCH = session({
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  title: "Victory League Rd 1",
  kind: "league",
  starts_at: "2026-09-20T15:00:00+08:00",
  team_id: TEAM_ID,
  team_name: "Futuro U8",
  team_kind: "competition_team",
});

describe("TR-1 attendance window", () => {
  it("keeps session starts inside the Taipei date range and drops the next day", () => {
    const rows = filterAttendanceRows(
      [
        {
          session: IN_WINDOW,
          playerId: "p1",
          player: PLAYER,
          jersey: 7,
          attendanceStatus: "present",
          creditsDebited: 1,
          leaveNote: null,
        },
        {
          session: OUT_WINDOW,
          playerId: "p1",
          player: PLAYER,
          jersey: 7,
          attendanceStatus: "present",
          creditsDebited: 1,
          leaveNote: null,
        },
      ],
      filters(),
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.session.id, SESSION_A);
  });
});

describe("TR-2 registration filters", () => {
  it("filters by kind, 梯隊, and keeps cancelled rows", () => {
    const special = session({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      title: "Special",
      kind: "special",
      starts_at: "2026-09-10T19:00:00+08:00",
      team_id: SQUAD_ID,
    });
    const otherSquad = session({
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      title: "Other squad",
      kind: "regular",
      starts_at: "2026-09-11T19:00:00+08:00",
      team_id: "33333333-3333-4333-8333-333333333333",
    });
    const rows = filterRegistrationRows(
      [
        {
          session: IN_WINDOW,
          playerId: "p1",
          player: PLAYER,
          jersey: 7,
          status: "cancelled",
          parentNote: "running late",
          registeredAt: "2026-09-01T12:00:00+08:00",
          hasQa: true,
        },
        {
          session: special,
          playerId: "p1",
          player: PLAYER,
          jersey: 7,
          status: "registered",
          parentNote: null,
          registeredAt: "2026-09-01T12:00:00+08:00",
          hasQa: false,
        },
        {
          session: otherSquad,
          playerId: "p1",
          player: PLAYER,
          jersey: 7,
          status: "registered",
          parentNote: null,
          registeredAt: "2026-09-01T12:00:00+08:00",
          hasQa: false,
        },
      ],
      filters({ reportType: "registrations", kinds: ["regular"], ageSquadIds: [SQUAD_ID] }),
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.status, "cancelled");
    assert.equal(rows[0]?.hasQa, true);
    const table = registrationsTable(rows, copy(), "en");
    assert.equal(table[1]?.[9], "Yes");
    assert.ok(!tableHasPiiHeaders(table));
  });
});

describe("TR-3 ledger matches UI sample", () => {
  it("uses the same type and actor labels as the admin credit UI", () => {
    const rows = filterLedgerRows(
      [
        {
          playerId: "p1",
          player: PLAYER,
          createdAt: "2026-09-08T19:30:00+08:00",
          entryType: "attend_debit",
          amount: -1,
          session: IN_WINDOW,
          actorRoles: ["parent", "admin"],
        },
        {
          playerId: "p1",
          player: PLAYER,
          createdAt: "2026-08-01T12:00:00+08:00",
          entryType: "purchase",
          amount: 10,
          session: null,
          actorRoles: ["admin"],
        },
      ],
      filters({ reportType: "credit_ledger" }),
    );
    assert.equal(rows.length, 1);
    const table = ledgerTable(rows, copy(), "en");
    assert.deepEqual(table[0], [
      "Player",
      "Time",
      "Type",
      "Amount",
      "Related session",
      "Actor role",
    ]);
    assert.equal(table[1]?.[0], "Kai Chen");
    assert.equal(table[1]?.[1], "2026-09-08 19:30");
    assert.equal(table[1]?.[2], "Attend debit");
    assert.equal(table[1]?.[3], "-1");
    assert.equal(table[1]?.[4], "Regular U8");
    assert.equal(table[1]?.[5], "Admin");
  });
});

describe("TR-4 match roster scoped", () => {
  it("keeps the selected 隊伍 league match and drops other teams/kinds", () => {
    const otherTeam = session({
      ...MATCH,
      id: "99999999-9999-4999-8999-999999999999",
      team_id: "44444444-4444-4444-8444-444444444444",
      team_name: "Futuro U9",
    });
    const rows = filterMatchRosterRows(
      [
        {
          session: MATCH,
          opponent: "Rivals",
          isPublished: true,
          publicStatus: "scheduled",
          player: PLAYER,
          jersey: 10,
        },
        {
          session: otherTeam,
          opponent: "Rivals",
          isPublished: false,
          publicStatus: "scheduled",
          player: PLAYER,
          jersey: 10,
        },
        {
          session: IN_WINDOW,
          opponent: null,
          isPublished: false,
          publicStatus: "scheduled",
          player: PLAYER,
          jersey: 7,
        },
      ],
      filters({
        reportType: "match_roster",
        competitionTeamIds: [TEAM_ID],
        kinds: ["league"],
      }),
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.session.team_id, TEAM_ID);
    const table = matchRosterTable(rows, copy(), "en");
    assert.equal(table[1]?.[3], "Rivals");
    assert.equal(table[1]?.[6], "Published");
  });
});

describe("TR-5 soft-deleted excluded by default", () => {
  it("drops deleted sessions unless includeDeleted is on", () => {
    const source = [
      {
        session: IN_WINDOW,
        playerId: "p1",
        player: PLAYER,
        jersey: 7,
        attendanceStatus: "present" as const,
        creditsDebited: 1,
        leaveNote: null,
      },
      {
        session: DELETED,
        playerId: "p1",
        player: PLAYER,
        jersey: 7,
        attendanceStatus: "present" as const,
        creditsDebited: 1,
        leaveNote: "sick",
      },
    ];
    assert.equal(filterAttendanceRows(source, filters()).length, 1);
    assert.equal(filterAttendanceRows(source, filters({ includeDeleted: true })).length, 2);
  });
});

describe("TR-6 non-admin denied", () => {
  it("uses the same admin gate as import", () => {
    assert.equal(canAccessAdmin(["parent"]), false);
    assert.equal(canAccessAdmin(["coach"]), false);
    assert.equal(canAccessAdmin(["parent", "coach"]), false);
    assert.equal(canAccessAdmin(["admin"]), true);
    const parsed = parseReportFilters({
      reportType: "attendance",
      format: "csv",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      kinds: [],
      ageSquadIds: [],
      competitionTeamIds: [],
      includeDeleted: false,
      sessionId: "",
      locale: "zh-Hant",
    });
    assert.equal(parsed.ok, true);
  });
});

describe("TR-7 CSV BOM opens in Excel with CJK", () => {
  it("prefixes UTF-8 BOM and keeps CJK headers/names", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const zh = JSON.parse(readFileSync(join(root, "messages/zh-Hant.json"), "utf8")) as {
      reports: { columns: { title: string; player: string } };
    };
    const zhCopy: ReportCopy = {
      ...copy(),
      columns: { ...copy().columns, title: zh.reports.columns.title, player: zh.reports.columns.player },
    };
    const table = attendanceTable(
      [
        {
          session: IN_WINDOW,
          playerId: "p1",
          player: PLAYER,
          jersey: 7,
          attendanceStatus: "present",
          creditsDebited: 1,
          leaveNote: null,
        },
      ],
      zhCopy,
      "zh-Hant",
    );
    const encoded = encodeReportFile(table, "csv");
    assert.equal(encoded.bytes[0], 0xef);
    assert.equal(encoded.bytes[1], 0xbb);
    assert.equal(encoded.bytes[2], 0xbf);
    const text = new TextDecoder().decode(encoded.bytes);
    assert.ok(text.includes("標題"));
    assert.ok(text.includes("球員"));
    assert.ok(text.includes("小凱"));
    const parsed = parseCsv(text);
    assert.equal(parsed[0]?.[0], "標題");
    assert.equal(parsed[1]?.[4], "小凱");
    const xlsx = parseXlsxTable(encodeReportFile(table, "xlsx").bytes);
    assert.equal(xlsx[0]?.[0], "標題");
    const name = reportFilename({
      reportType: "attendance",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      exportedAt: new Date("2026-09-08T11:30:00+08:00"),
      format: "csv",
    });
    assert.match(name, /^attendance_2026-09-01_2026-09-30_\d{8}-\d{6}\.csv$/);
    assert.equal(formatExportStamp(new Date("2026-09-08T11:30:45+08:00")), "20260908-113045");
  });
});

describe("TR-8 over-limit error", () => {
  it("errors when data rows exceed 5000", () => {
    assert.equal(reportCapError(5000), null);
    assert.equal(reportCapError(5001), "reportTooManyRows");
    assert.equal(REPORT_ROW_CAP, 5000);
    const parsed = parseReportFilters({
      reportType: "attendance",
      format: "csv",
      dateFrom: "2026-10-01",
      dateTo: "2026-09-01",
      kinds: [],
      ageSquadIds: [],
      competitionTeamIds: [],
      includeDeleted: false,
      sessionId: "",
      locale: "en",
    });
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.equal(parsed.errorKey, "reportInvalidDateRange");
    }
  });
});
