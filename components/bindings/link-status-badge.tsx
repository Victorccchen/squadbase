import type { LinkStatus } from "@/lib/supabase/database.types";

const STATUS_CLASS: Record<LinkStatus, string> = {
  approved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  rejected: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
  pending: "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100",
  revoked: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
};

export function LinkStatusBadge({
  status,
  label,
}: {
  status: LinkStatus;
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
