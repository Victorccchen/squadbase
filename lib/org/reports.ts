/**
 * Stage R admin Excel/CSV reports (pure).
 *
 * Four MVP types: attendance, registrations, credit ledger, match roster.
 * Browser download only. Row cap 5000. Soft-deleted sessions excluded by
 * default. CSV headers follow the UI locale. No parent phones/contact PII.
 */

import type { AppRole } from "../supabase/database.types.ts";
import type { PlayerNameFields } from "./display-name.ts";
import { englishPlayerName, localizedPlayerName } from "./display-name.ts";
import type { OrgErrorKey } from "./errors.ts";
import { stringifyCsv } from "./import-csv.ts";
import { workbookToXlsx } from "./import-xlsx-write.ts";
import { MATCH_KINDS, isMatchKind } from "./match.ts";
import { parseUuid, readAllStrings, readString } from "./parse.ts";
import { clubRangeToTimestamptz } from "./session-calendar.ts";
import {
  SESSION_KINDS,
  addCalendarDays,
  formatCalendarDate,
  parseCalendarDateParts,
  parseSessionKind,
  type SessionKind,
} from "./session-recurrence.ts";
import { CLUB_TIME_ZONE, toDateTimeLocalInput } from "./session-time.ts";
import { isSoftDeleted } from "./soft-delete.ts";
import type { AttendanceStatus } from "../credits/debit-rules.ts";
import type { CreditLedgerEntryType } from "../credits/debit-rules.ts";
import type { MatchPublicStatus } from "../supabase/database.types.ts";
import type { SessionRegistrationStatus } from "../supabase/database.types.ts";
import type { TeamKind } from "../supabase/database.types.ts";

export const REPORT_TYPES = [
  "attendance",
  "registrations",
  "credit_ledger",
  "match_roster",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_FORMATS = ["csv", "xlsx"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const REPORT_ROW_CAP = 5000;

export const CSV_MIME = "text/csv;charset=utf-8";
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type ReportSessionRef = {
  id: string;
  title: string;
  kind: SessionKind;
  starts_at: string;
  team_id: string;
  team_name: string | null;
  team_kind: TeamKind | null;
  deleted_at: string | null;
};

export type ReportFilters = {
  reportType: ReportType;
  format: ReportFormat;
  dateFrom: string | null;
  dateTo: string | null;
  kinds: SessionKind[];
  ageSquadIds: string[];
  competitionTeamIds: string[];
  includeDeleted: boolean;
  sessionId: string | null;
  locale: string;
};

export type ReportCopy = {
  columns: {
    title: string;
    date: string;
    kind: string;
    unit: string;
    player: string;
    jersey: string;
    attendanceStatus: string;
    creditsDebited: string;
    leaveNote: string;
    registrationStatus: string;
    parentNote: string;
    registeredAt: string;
    hasQa: string;
    time: string;
    ledgerType: string;
    amount: string;
    relatedSession: string;
    actorRole: string;
    opponent: string;
    published: string;
    publicStatus: string;
  };
  kinds: Record<SessionKind, string>;
  attendance: Record<AttendanceStatus, string>;
  attendanceUnmarked: string;
  registrationStatus: Record<SessionRegistrationStatus, string>;
  ledgerTypes: Record<CreditLedgerEntryType, string>;
  actorRoles: Record<AppRole, string>;
  actorUnknown: string;
  publicStatus: Record<MatchPublicStatus, string>;
  published: string;
  unpublished: string;
  yes: string;
  no: string;
  opponentTbd: string;
};

export type AttendanceSourceRow = {
  session: ReportSessionRef;
  playerId: string;
  player: PlayerNameFields;
  jersey: number | null;
  attendanceStatus: AttendanceStatus | null;
  creditsDebited: number;
  leaveNote: string | null;
};

export type RegistrationSourceRow = {
  session: ReportSessionRef;
  playerId: string;
  player: PlayerNameFields;
  jersey: number | null;
  status: SessionRegistrationStatus;
  parentNote: string | null;
  registeredAt: string;
  hasQa: boolean;
};

export type LedgerSourceRow = {
  playerId: string;
  player: PlayerNameFields;
  createdAt: string;
  entryType: CreditLedgerEntryType;
  amount: number;
  session: ReportSessionRef | null;
  actorRoles: AppRole[];
};

export type MatchRosterSourceRow = {
  session: ReportSessionRef;
  opponent: string | null;
  isPublished: boolean;
  publicStatus: MatchPublicStatus;
  player: PlayerNameFields;
  jersey: number;
};

export function isReportType(value: string): value is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(value);
}

export function isReportFormat(value: string): value is ReportFormat {
  return (REPORT_FORMATS as readonly string[]).includes(value);
}

export function defaultReportDateRange(now = new Date()): { from: string; to: string } {
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

export function reportDateBounds(
  filters: Pick<ReportFilters, "dateFrom" | "dateTo">,
): { from: string; toExclusive: string } | null {
  if (!filters.dateFrom && !filters.dateTo) {
    return null;
  }
  if (!filters.dateFrom || !filters.dateTo) {
    return null;
  }
  return clubRangeToTimestamptz(filters.dateFrom, filters.dateTo);
}

export function instantInRange(iso: string, from: string, toExclusive: string): boolean {
  const t = Date.parse(iso);
  const a = Date.parse(from);
  const b = Date.parse(toExclusive);
  if (Number.isNaN(t) || Number.isNaN(a) || Number.isNaN(b)) {
    return false;
  }
  return t >= a && t < b;
}

export function selectedUnitIds(filters: Pick<ReportFilters, "ageSquadIds" | "competitionTeamIds">): string[] {
  return [...filters.ageSquadIds, ...filters.competitionTeamIds];
}

export function kindsForReport(filters: Pick<ReportFilters, "reportType" | "kinds">): SessionKind[] | null {
  if (filters.reportType === "match_roster") {
    if (filters.kinds.length === 0) {
      return [...MATCH_KINDS];
    }
    return filters.kinds.filter(isMatchKind);
  }
  if (filters.kinds.length === 0) {
    return null;
  }
  return filters.kinds;
}

export function sessionPassesFilters(
  session: ReportSessionRef,
  filters: ReportFilters,
): boolean {
  if (filters.sessionId) {
    return session.id === filters.sessionId;
  }
  if (!filters.includeDeleted && isSoftDeleted(session)) {
    return false;
  }
  const kinds = kindsForReport(filters);
  if (kinds && !kinds.includes(session.kind)) {
    return false;
  }
  const units = selectedUnitIds(filters);
  if (units.length > 0 && !units.includes(session.team_id)) {
    return false;
  }
  const bounds = reportDateBounds(filters);
  if (bounds && !instantInRange(session.starts_at, bounds.from, bounds.toExclusive)) {
    return false;
  }
  return true;
}

export function ledgerPassesFilters(row: LedgerSourceRow, filters: ReportFilters): boolean {
  if (filters.sessionId) {
    return row.session?.id === filters.sessionId;
  }
  const bounds = reportDateBounds(filters);
  if (bounds && !instantInRange(row.createdAt, bounds.from, bounds.toExclusive)) {
    return false;
  }
  const kinds = kindsForReport(filters);
  const units = selectedUnitIds(filters);
  const sessionConstrained = Boolean(kinds) || units.length > 0 || !filters.includeDeleted;
  if (!row.session) {
    return !kinds && units.length === 0;
  }
  if (sessionConstrained && !filters.includeDeleted && isSoftDeleted(row.session)) {
    return false;
  }
  if (kinds && !kinds.includes(row.session.kind)) {
    return false;
  }
  if (units.length > 0 && !units.includes(row.session.team_id)) {
    return false;
  }
  return true;
}

export function filterAttendanceRows(
  rows: readonly AttendanceSourceRow[],
  filters: ReportFilters,
): AttendanceSourceRow[] {
  return rows.filter((row) => sessionPassesFilters(row.session, filters));
}

export function filterRegistrationRows(
  rows: readonly RegistrationSourceRow[],
  filters: ReportFilters,
): RegistrationSourceRow[] {
  return rows.filter((row) => sessionPassesFilters(row.session, filters));
}

export function filterLedgerRows(
  rows: readonly LedgerSourceRow[],
  filters: ReportFilters,
): LedgerSourceRow[] {
  return rows.filter((row) => ledgerPassesFilters(row, filters));
}

export function filterMatchRosterRows(
  rows: readonly MatchRosterSourceRow[],
  filters: ReportFilters,
): MatchRosterSourceRow[] {
  return rows.filter((row) => sessionPassesFilters(row.session, filters));
}

export function reportCapError(dataRowCount: number): "reportTooManyRows" | null {
  return dataRowCount > REPORT_ROW_CAP ? "reportTooManyRows" : null;
}

export function formatClubWallStamp(iso: string): string {
  const local = toDateTimeLocalInput(iso);
  if (!local) {
    return iso;
  }
  return local.replace("T", " ");
}

export function formatExportStamp(date: Date, timeZone = CLUB_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  let hour = value("hour");
  if (hour === "24") {
    hour = "00";
  }
  return `${value("year")}${value("month")}${value("day")}-${hour.padStart(2, "0")}${value("minute")}${value("second")}`;
}

export function reportFilename(options: {
  reportType: ReportType;
  dateFrom: string | null;
  dateTo: string | null;
  exportedAt: Date;
  format: ReportFormat;
}): string {
  const range =
    options.dateFrom && options.dateTo
      ? `${options.dateFrom}_${options.dateTo}`
      : options.dateFrom
        ? `${options.dateFrom}_open`
        : options.dateTo
          ? `open_${options.dateTo}`
          : "all";
  return `${options.reportType}_${range}_${formatExportStamp(options.exportedAt)}.${options.format}`;
}

function playerCell(player: PlayerNameFields, locale: string): string {
  return localizedPlayerName(player, locale) || englishPlayerName(player);
}

function jerseyCell(value: number | null): string {
  return value == null ? "" : String(value);
}

function pickActorRole(roles: readonly AppRole[]): AppRole | null {
  if (roles.includes("admin")) {
    return "admin";
  }
  if (roles.includes("coach")) {
    return "coach";
  }
  if (roles.includes("parent")) {
    return "parent";
  }
  if (roles.includes("player")) {
    return "player";
  }
  return null;
}

export function attendanceTable(
  rows: readonly AttendanceSourceRow[],
  copy: ReportCopy,
  locale: string,
): string[][] {
  const header = [
    copy.columns.title,
    copy.columns.date,
    copy.columns.kind,
    copy.columns.unit,
    copy.columns.player,
    copy.columns.jersey,
    copy.columns.attendanceStatus,
    copy.columns.creditsDebited,
    copy.columns.leaveNote,
  ];
  const body = rows.map((row) => [
    row.session.title,
    formatClubWallStamp(row.session.starts_at),
    copy.kinds[row.session.kind],
    row.session.team_name ?? "",
    playerCell(row.player, locale),
    jerseyCell(row.jersey),
    row.attendanceStatus ? copy.attendance[row.attendanceStatus] : copy.attendanceUnmarked,
    String(row.creditsDebited),
    row.leaveNote ?? "",
  ]);
  return [header, ...body];
}

export function registrationsTable(
  rows: readonly RegistrationSourceRow[],
  copy: ReportCopy,
  locale: string,
): string[][] {
  const header = [
    copy.columns.title,
    copy.columns.date,
    copy.columns.kind,
    copy.columns.unit,
    copy.columns.player,
    copy.columns.jersey,
    copy.columns.registrationStatus,
    copy.columns.parentNote,
    copy.columns.registeredAt,
    copy.columns.hasQa,
  ];
  const body = rows.map((row) => [
    row.session.title,
    formatClubWallStamp(row.session.starts_at),
    copy.kinds[row.session.kind],
    row.session.team_name ?? "",
    playerCell(row.player, locale),
    jerseyCell(row.jersey),
    copy.registrationStatus[row.status],
    row.parentNote ?? "",
    formatClubWallStamp(row.registeredAt),
    row.hasQa ? copy.yes : copy.no,
  ]);
  return [header, ...body];
}

export function ledgerTable(
  rows: readonly LedgerSourceRow[],
  copy: ReportCopy,
  locale: string,
): string[][] {
  const header = [
    copy.columns.player,
    copy.columns.time,
    copy.columns.ledgerType,
    copy.columns.amount,
    copy.columns.relatedSession,
    copy.columns.actorRole,
  ];
  const body = rows.map((row) => {
    const role = pickActorRole(row.actorRoles);
    return [
      playerCell(row.player, locale),
      formatClubWallStamp(row.createdAt),
      copy.ledgerTypes[row.entryType],
      String(row.amount),
      row.session?.title ?? "",
      role ? copy.actorRoles[role] : copy.actorUnknown,
    ];
  });
  return [header, ...body];
}

export function matchRosterTable(
  rows: readonly MatchRosterSourceRow[],
  copy: ReportCopy,
  locale: string,
): string[][] {
  const header = [
    copy.columns.title,
    copy.columns.date,
    copy.columns.unit,
    copy.columns.opponent,
    copy.columns.player,
    copy.columns.jersey,
    copy.columns.published,
    copy.columns.publicStatus,
  ];
  const body = rows.map((row) => [
    row.session.title,
    formatClubWallStamp(row.session.starts_at),
    row.session.team_name ?? "",
    row.opponent?.trim() ? row.opponent.trim() : copy.opponentTbd,
    playerCell(row.player, locale),
    jerseyCell(row.jersey),
    row.isPublished ? copy.published : copy.unpublished,
    copy.publicStatus[row.publicStatus],
  ]);
  return [header, ...body];
}

export function buildReportTable(
  input:
    | { type: "attendance"; rows: readonly AttendanceSourceRow[] }
    | { type: "registrations"; rows: readonly RegistrationSourceRow[] }
    | { type: "credit_ledger"; rows: readonly LedgerSourceRow[] }
    | { type: "match_roster"; rows: readonly MatchRosterSourceRow[] },
  copy: ReportCopy,
  locale: string,
): string[][] {
  if (input.type === "attendance") {
    return attendanceTable(input.rows, copy, locale);
  }
  if (input.type === "registrations") {
    return registrationsTable(input.rows, copy, locale);
  }
  if (input.type === "credit_ledger") {
    return ledgerTable(input.rows, copy, locale);
  }
  return matchRosterTable(input.rows, copy, locale);
}

export function encodeReportFile(
  table: readonly (readonly string[])[],
  format: ReportFormat,
): { bytes: Uint8Array; mime: string } {
  if (format === "csv") {
    return {
      bytes: new TextEncoder().encode(stringifyCsv(table)),
      mime: CSV_MIME,
    };
  }
  return { bytes: workbookToXlsx(table), mime: XLSX_MIME };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function tableHasPiiHeaders(table: readonly (readonly string[])[]): boolean {
  const header = (table[0] ?? []).map((value) => value.toLowerCase());
  return header.some(
    (value) =>
      value.includes("phone") ||
      value.includes("電話") ||
      value.includes("電話番号") ||
      value.includes("last5") ||
      value.includes("email") ||
      value.includes("mail"),
  );
}

export function parseReportFilters(input: {
  reportType: string;
  format: string;
  dateFrom: string;
  dateTo: string;
  kinds: readonly string[];
  ageSquadIds: readonly string[];
  competitionTeamIds: readonly string[];
  includeDeleted: boolean;
  sessionId: string;
  locale: string;
}): { ok: true; filters: ReportFilters } | { ok: false; errorKey: OrgErrorKey } {
  if (!isReportType(input.reportType)) {
    return { ok: false, errorKey: "invalidReportType" };
  }
  if (!isReportFormat(input.format)) {
    return { ok: false, errorKey: "invalidReportFormat" };
  }
  const dateFrom = input.dateFrom.trim();
  const dateTo = input.dateTo.trim();
  if (dateFrom && !parseCalendarDateParts(dateFrom)) {
    return { ok: false, errorKey: "reportInvalidDateRange" };
  }
  if (dateTo && !parseCalendarDateParts(dateTo)) {
    return { ok: false, errorKey: "reportInvalidDateRange" };
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return { ok: false, errorKey: "reportInvalidDateRange" };
  }
  if ((dateFrom && !dateTo) || (!dateFrom && dateTo)) {
    return { ok: false, errorKey: "reportInvalidDateRange" };
  }
  const kinds = input.kinds
    .map((value) => parseSessionKind(value))
    .filter((kind): kind is SessionKind => kind !== null);
  const ageSquadIds = input.ageSquadIds
    .map((value) => parseUuid(value))
    .filter((id): id is string => id !== null);
  const competitionTeamIds = input.competitionTeamIds
    .map((value) => parseUuid(value))
    .filter((id): id is string => id !== null);
  const sessionIdRaw = input.sessionId.trim();
  const sessionId = sessionIdRaw ? parseUuid(sessionIdRaw) : null;
  if (sessionIdRaw && !sessionId) {
    return { ok: false, errorKey: "sessionNotFound" };
  }

  return {
    ok: true,
    filters: {
      reportType: input.reportType,
      format: input.format,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      kinds,
      ageSquadIds,
      competitionTeamIds,
      includeDeleted: input.includeDeleted,
      sessionId,
      locale: input.locale.trim() || "zh-Hant",
    },
  };
}

export function parseReportFormData(formData: FormData):
  | { ok: true; filters: ReportFilters }
  | { ok: false; errorKey: OrgErrorKey } {
  return parseReportFilters({
    reportType: readString(formData, "reportType"),
    format: readString(formData, "format") || "csv",
    dateFrom: readString(formData, "dateFrom"),
    dateTo: readString(formData, "dateTo"),
    kinds: readAllStrings(formData, "kind"),
    ageSquadIds: readAllStrings(formData, "ageSquad"),
    competitionTeamIds: readAllStrings(formData, "competitionTeam"),
    includeDeleted: readString(formData, "includeDeleted") === "1",
    sessionId: readString(formData, "sessionId"),
    locale: readString(formData, "locale"),
  });
}

export const ALL_SESSION_KINDS: SessionKind[] = [...SESSION_KINDS];
export const MATCH_REPORT_KINDS: SessionKind[] = [...MATCH_KINDS];
export const TRAINING_REPORT_KINDS: SessionKind[] = ["regular", "special"];
