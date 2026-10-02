/**
 * Phase 1 PR-03 task inbox helpers (pure).
 *
 * Tasks are opened and closed by database triggers; the inbox only shows,
 * orders and links them. Kinds not listed here still show, with a generic label.
 */

import type { Task } from "../supabase/database.types.ts";

export const KNOWN_TASK_KINDS = [
  "payment_claim.pending",
  "guardian_link.pending",
  // PR-06
  "leave_request.pending",
  "credits.renew",
  "credits.limit_reached",
  // PR-07
  "attendance.headcount_mismatch",
  "attendance.headcount_missing",
  // PR-08a
  "invoice.pending",
] as const;
export type KnownTaskKind = (typeof KNOWN_TASK_KINDS)[number];

export function isKnownTaskKind(kind: string): kind is KnownTaskKind {
  return (KNOWN_TASK_KINDS as readonly string[]).includes(kind);
}

type LinkableTask = Pick<Task, "kind" | "entity_id" | "params">;

function uuidParam(params: Task["params"], key: string): string | null {
  const value = params && typeof params === "object" ? (params as Record<string, unknown>)[key] : null;
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

/** Admin page that resolves the task, or null when the kind has no page yet. */
export function taskHref(task: LinkableTask): string | null {
  switch (task.kind) {
    case "payment_claim.pending":
    case "invoice.pending":
      return "/app/admin/claims";
    case "guardian_link.pending":
      return "/app/admin/bindings";
    case "leave_request.pending": {
      const sessionId = uuidParam(task.params, "session_id");
      return sessionId ? `/app/admin/sessions/${sessionId}` : null;
    }
    case "credits.renew":
    case "credits.limit_reached":
      return task.entity_id ? `/app/admin/players/${task.entity_id}` : null;
    case "attendance.headcount_mismatch":
    case "attendance.headcount_missing":
      return task.entity_id ? `/app/admin/sessions/${task.entity_id}` : null;
    default:
      return null;
  }
}

/** Player the task is about, when the task itself names one. */
export function taskPlayerId(task: Pick<Task, "kind" | "entity_type" | "entity_id" | "params">): string | null {
  if (task.entity_type === "player") {
    return task.entity_id;
  }
  return uuidParam(task.params, "player_id");
}

/** i18n key under `tasks.kinds`; unknown kinds fall back to `other`. */
export function taskKindMessageKey(kind: string): string {
  return isKnownTaskKind(kind) ? kind.replace(".", "_") : "other";
}

type InboxTask = Pick<Task, "status" | "snoozed_until" | "due_at" | "created_at">;

/** Open tasks, plus snoozed ones whose snooze has ended. */
export function isInInbox(task: InboxTask, now: Date): boolean {
  if (task.status === "open") {
    return true;
  }
  if (task.status === "snoozed" && task.snoozed_until) {
    return new Date(task.snoozed_until).getTime() <= now.getTime();
  }
  return false;
}

/** Due date first (earliest, undated last), then oldest first. */
export function compareInboxTasks(a: InboxTask, b: InboxTask): number {
  const dueA = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
  const dueB = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
  if (dueA !== dueB) {
    return dueA - dueB;
  }
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

export function inboxTasks<T extends InboxTask>(tasks: readonly T[], now: Date): T[] {
  return tasks.filter((task) => isInInbox(task, now)).sort(compareInboxTasks);
}

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Snooze target: 08:00 Asia/Taipei on the next calendar day (Taipei has no DST). */
export function nextTaipeiMorning(now: Date): Date {
  const taipei = new Date(now.getTime() + TAIPEI_OFFSET_MS);
  const nextDayUtcMidnight = Date.UTC(
    taipei.getUTCFullYear(),
    taipei.getUTCMonth(),
    taipei.getUTCDate() + 1,
  );
  // 08:00 Taipei = 00:00 UTC of the same calendar date.
  return new Date(nextDayUtcMidnight + 8 * 60 * 60 * 1000 - TAIPEI_OFFSET_MS);
}

export const TASK_DECISIONS = ["done", "dismissed", "snoozed"] as const;
export type TaskDecision = (typeof TASK_DECISIONS)[number];

export function parseTaskDecision(value: string): TaskDecision | null {
  return (TASK_DECISIONS as readonly string[]).includes(value) ? (value as TaskDecision) : null;
}
