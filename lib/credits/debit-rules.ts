/**
 * Stage 4B prepaid credit debit rules (pure).
 *
 * Credits apply to U8 and U10–U18 only (player’s current team age band
 * chooses the purchase catalog; the session team’s age band decides whether
 * this session debits). U6, reserve, and senior/adult sessions never debit
 * (UI label: 不扣堂).
 *
 * Kind defaults (when no_debit is false and no override):
 * - regular: 1 on present or unexcused_absent; 0 if excused
 * - special: 2 on present or unexcused_absent; 0 if excused leave approved
 * - cup/league: 1 per competing player per club calendar day (skip if already
 *   match-debited that day)
 *
 * Signup does not pre-debit. Cancel before attendance: no debit.
 * Per-session admin override: no_debit or debit_override_n.
 */

import type { AgeBand } from "../age-band.ts";
import type { SessionKind } from "../org/session-recurrence.ts";

export const PACKAGE_CATALOG_BANDS = ["U8", "U10_U18"] as const;
export type PackageCatalogBand = (typeof PACKAGE_CATALOG_BANDS)[number];

export const ATTENDANCE_STATUSES = [
  "present",
  "excused_absent",
  "unexcused_absent",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const CREDIT_LEDGER_ENTRY_TYPES = [
  "purchase",
  "attend_debit",
  "no_show_debit",
  "match_debit",
  "admin_adjust",
  "reversal",
] as const;
export type CreditLedgerEntryType = (typeof CREDIT_LEDGER_ENTRY_TYPES)[number];

export type DebitEntryType = Extract<
  CreditLedgerEntryType,
  "attend_debit" | "no_show_debit" | "match_debit"
>;

export type ComputeDebitInput = {
  kind: SessionKind;
  teamAgeBand: AgeBand;
  attendanceStatus: AttendanceStatus;
  noDebit: boolean;
  debitOverrideN: number | null;
  excusedLeaveApproved: boolean;
  alreadyDebitedSameMatchDay: boolean;
};

export type ComputeDebitResult = {
  credits: number;
  entryType: DebitEntryType | null;
  noDebitLabel: boolean;
};

const U10_U18_BANDS: ReadonlySet<AgeBand> = new Set(["U10", "U12", "U15", "U18"]);

export function isAttendanceStatus(value: string): value is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

export function parseAttendanceStatus(value: string): AttendanceStatus | null {
  return isAttendanceStatus(value) ? value : null;
}

export function catalogBandFromTeamAgeBand(
  ageBand: AgeBand,
): PackageCatalogBand | null {
  if (ageBand === "U8") {
    return "U8";
  }
  if (U10_U18_BANDS.has(ageBand)) {
    return "U10_U18";
  }
  return null;
}

export function creditsApplyToAgeBand(ageBand: AgeBand): boolean {
  return catalogBandFromTeamAgeBand(ageBand) !== null;
}

function overrideEntryType(
  kind: SessionKind,
  attendanceStatus: AttendanceStatus,
): DebitEntryType {
  if (kind === "cup" || kind === "league") {
    return "match_debit";
  }
  if (attendanceStatus === "unexcused_absent") {
    return "no_show_debit";
  }
  return "attend_debit";
}

export function computeSessionDebit(input: ComputeDebitInput): ComputeDebitResult {
  const bandNoDebit = !creditsApplyToAgeBand(input.teamAgeBand);
  if (bandNoDebit || input.noDebit) {
    return { credits: 0, entryType: null, noDebitLabel: true };
  }

  if (input.excusedLeaveApproved || input.attendanceStatus === "excused_absent") {
    return { credits: 0, entryType: null, noDebitLabel: false };
  }

  if (input.debitOverrideN !== null) {
    const n = input.debitOverrideN;
    if (!Number.isInteger(n) || n < 0) {
      return { credits: 0, entryType: null, noDebitLabel: false };
    }
    if (n === 0) {
      return { credits: 0, entryType: null, noDebitLabel: true };
    }
    if (
      (input.kind === "cup" || input.kind === "league") &&
      input.alreadyDebitedSameMatchDay
    ) {
      return { credits: 0, entryType: null, noDebitLabel: false };
    }
    return {
      credits: n,
      entryType: overrideEntryType(input.kind, input.attendanceStatus),
      noDebitLabel: false,
    };
  }

  if (input.kind === "regular") {
    if (
      input.attendanceStatus === "present" ||
      input.attendanceStatus === "unexcused_absent"
    ) {
      return {
        credits: 1,
        entryType:
          input.attendanceStatus === "unexcused_absent" ? "no_show_debit" : "attend_debit",
        noDebitLabel: false,
      };
    }
    return { credits: 0, entryType: null, noDebitLabel: false };
  }

  if (input.kind === "special") {
    if (
      input.attendanceStatus === "present" ||
      input.attendanceStatus === "unexcused_absent"
    ) {
      return {
        credits: 2,
        entryType:
          input.attendanceStatus === "unexcused_absent" ? "no_show_debit" : "attend_debit",
        noDebitLabel: false,
      };
    }
    return { credits: 0, entryType: null, noDebitLabel: false };
  }

  if (input.alreadyDebitedSameMatchDay) {
    return { credits: 0, entryType: null, noDebitLabel: false };
  }

  if (
    input.attendanceStatus === "present" ||
    input.attendanceStatus === "unexcused_absent"
  ) {
    return { credits: 1, entryType: "match_debit", noDebitLabel: false };
  }

  return { credits: 0, entryType: null, noDebitLabel: false };
}

export const LOW_BALANCE_THRESHOLD = 1;

export function isLowBalance(creditsAvailable: number): boolean {
  return creditsAvailable <= LOW_BALANCE_THRESHOLD;
}

export function defaultNoticeDebit(
  kind: SessionKind,
  teamAgeBand: AgeBand,
  noDebit: boolean,
  debitOverrideN: number | null,
): ComputeDebitResult {
  return computeSessionDebit({
    kind,
    teamAgeBand,
    attendanceStatus: "present",
    noDebit,
    debitOverrideN,
    excusedLeaveApproved: false,
    alreadyDebitedSameMatchDay: false,
  });
}
