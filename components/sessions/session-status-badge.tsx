import type { OrgStatus, SessionRegistrationStatus } from "@/lib/supabase/database.types";

const SESSION_STATUS_CLASS: Record<OrgStatus, string> = {
  active: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  inactive: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
};

const REGISTRATION_STATUS_CLASS: Record<SessionRegistrationStatus, string> = {
  registered: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  cancelled: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
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