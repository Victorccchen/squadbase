import type { OrgStatus, SessionKind, SessionRegistrationStatus } from "@/lib/supabase/database.types";

const SESSION_STATUS_CLASS: Record<OrgStatus, string> = {
  active: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  inactive: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
};

const REGISTRATION_STATUS_CLASS: Record<SessionRegistrationStatus, string> = {
  registered: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  cancelled: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
};

const KIND_CLASS: Record<SessionKind, string> = {
  regular: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
  special: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100",
  cup: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  league: "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100",
};

export function SessionStatusBadge({
  status,
  label,
}: {
  status: OrgStatus;
  label: string;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${SESSION_STATUS_CLASS[status]}`}
    >
      {label}
    </span>
  );
}

export function RegistrationStatusBadge({
  status,
  label,
}: {
  status: SessionRegistrationStatus;
  label: string;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${REGISTRATION_STATUS_CLASS[status]}`}
    >
      {label}
    </span>
  );
}

export function SessionKindBadge({
  kind,
  label,
}: {
  kind: SessionKind;
  label: string;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${KIND_CLASS[kind]}`}
    >
      {label}
    </span>
  );
}

export function SessionDeletedBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-red-900 dark:bg-red-950 dark:text-red-100">
      {label}
    </span>
  );
}

export function SessionPlayoffBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-orange-900 dark:bg-orange-950 dark:text-orange-100">
      {label}
    </span>
  );
}
