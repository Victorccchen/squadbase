/**
 * Stage 4B prepaid credit debit rules (pure).
 *
 * Credits apply to U8 and U10–U18 only (player’s current team age band
 * chooses the purchase catalog; the session team’s age band decides whether
 * this session debits). U6, reserve, and senior/adult sessions never debit
 * (UI label: 不扣堂).
 *
 * Kind defaults (when no_debit is false and no override):
 * - regular: 1 on present; 0 on unexcused_absent (無故缺席) or excused
 * - special: 2 on present or unexcused_absent; 0 if excused leave approved
 * - cup/league/friendly: 1 per competing player per club calendar day (skip if
 *   already match-debited that day)
 *
 * Signup does not pre-debit. Cancel before attendance: no debit, except a
 * special/match cancelled by the parent within 24 hours of the start
 * (late_cancelled), which counts as a no-show unless leave is approved (D2-1).
 * Per-session admin override: no_debit or debit_override_n (override still wins).
 * Attendance never fails for lack of credits; balances may go negative and new
 * sign-ups stop at CREDIT_OVERDRAFT_LIMIT owed (D3, PR-06).
 *
 * The debit table is shared with SQL through debit-rules.fixtures.json.
 */

import type { AgeBand } from "../age-band.ts";
import { isMatchKind } from "../org/match.ts";
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
  if (isMatchKind(kind)) {
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
    if (isMatchKind(input.kind) && input.alreadyDebitedSameMatchDay) {
      return { credits: 0, entryType: null, noDebitLabel: false };
    }
    return {
      credits: n,
      entryType: overrideEntryType(input.kind, input.attendanceStatus),
      noDebitLabel: false,
    };
  }

  if (input.kind === "regular") {
    if (input.attendanceStatus === "present") {
      return {
        credits: 1,
        entryType: "attend_debit",
        noDebitLabel: false,
      };
    }
    // unexcused_absent (無故缺席): 0 — only special unexcused still deducts.
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

/** D3: owing this many credits (balance <= -limit) blocks new sign-ups. Same as credit_overdraft_limit() in SQL. */
export const CREDIT_OVERDRAFT_LIMIT = 3;

export const LATE_CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isAtCreditLimit(creditsAvailable: number): boolean {
  return creditsAvailable <= -CREDIT_OVERDRAFT_LIMIT;
}

/** Owed credits for display (欠 N 堂); 0 when the balance is not negative. */
export function owedCredits(creditsAvailable: number): number {
  return creditsAvailable < 0 ? -creditsAvailable : 0;
}

/**
 * True when a parent's cancel now would be recorded as late_cancelled: special
 * or match sessions within 24 hours of the start (or after it). Mirrors
 * cancel_session_registration.
 */
export function isLateCancel(input: { kind: SessionKind; startsAt: string | Date; now?: Date }): boolean {
  if (input.kind === "regular") {
    return false;
  }
  const starts = new Date(input.startsAt).getTime();
  const now = (input.now ?? new Date()).getTime();
  return starts - now <= LATE_CANCEL_WINDOW_MS;
}

/** Credits a late cancel will cost (treated as a no-show), for the confirm dialog. */
export function lateCancelDebit(input: {
  kind: SessionKind;
  teamAgeBand: AgeBand;
  noDebit: boolean;
  debitOverrideN: number | null;
}): number {
  return computeSessionDebit({
    kind: input.kind,
    teamAgeBand: input.teamAgeBand,
    attendanceStatus: "unexcused_absent",
    noDebit: input.noDebit,
    debitOverrideN: input.debitOverrideN,
    excusedLeaveApproved: false,
    alreadyDebitedSameMatchDay: false,
  }).credits;
}

/** lateCancelDebit for a loaded session row (team joined). Unknown team → 0. */
export function lateCancelCreditsForSession(session: {
  kind: SessionKind;
  no_debit: boolean;
  debit_override_n: number | null;
  team?: { age_band: AgeBand } | null;
}): number {
  if (!session.team) {
    return 0;
  }
  return lateCancelDebit({
    kind: session.kind,
    teamAgeBand: session.team.age_band,
    noDebit: session.no_debit,
    debitOverrideN: session.debit_override_n,
  });
}

export const LEAVE_REASON_CATEGORIES = ["illness", "injury", "family", "school", "other"] as const;
export type LeaveReasonCategory = (typeof LEAVE_REASON_CATEGORIES)[number];

export function parseLeaveReasonCategory(value: string): LeaveReasonCategory | null {
  return (LEAVE_REASON_CATEGORIES as readonly string[]).includes(value)
    ? (value as LeaveReasonCategory)
    : null;
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
