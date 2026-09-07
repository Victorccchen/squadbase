import type { MatchPublicStatus } from "@/lib/supabase/database.types";

const STATUS_CLASS: Record<MatchPublicStatus, string> = {
  scheduled: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
  completed: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  cancelled: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
};

export function MatchStatusBadge({
  status,
  label,
}: {
  status: MatchPublicStatus;
  label: string;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${STATUS_CLASS[status]}`}
    >
      {label}
    </span>
  );
}

const SIDE_CLASS = "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100";

export function MatchSideBadge({ label }: { label: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${SIDE_CLASS}`}
    >
      {label}
    </span>
  );
}
