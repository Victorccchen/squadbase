import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SESSION_KINDS } from "@/lib/org/session-recurrence";
import type { SessionKind } from "@/lib/supabase/database.types";
import { calendarHrefPath, type CalendarListHref } from "@/lib/org/session-calendar";
import { SESSION_KIND_DOT_CLASS } from "@/lib/org/session-kind-colors";

export async function SessionKindLegend({
  kinds = SESSION_KINDS,
}: {
  kinds?: readonly SessionKind[];
}) {
  const t = await getTranslations("sessions");
  const admin = await getTranslations("admin");

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {admin("calendarLegend")}
      </p>
      <ul className="flex flex-wrap gap-3 text-sm">
        {kinds.map((kind) => (
          <li key={kind} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${SESSION_KIND_DOT_CLASS[kind]}`}
              aria-hidden
            />
            {t(`kinds.${kind}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SessionViewToggle({
  calendarHref,
  listHref,
  view,
  calendarLabel,
  listLabel,
  toggleLabel,
}: {
  calendarHref: CalendarListHref;
  listHref: CalendarListHref;
  view: "calendar" | "list";
  calendarLabel: string;
  listLabel: string;
  toggleLabel: string;
}) {
  const base =
    "inline-flex flex-1 items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium";
  const active = "bg-foreground text-background shadow-sm";
  const idle = "text-zinc-700 hover:bg-white/80 dark:text-zinc-200 dark:hover:bg-zinc-900/80";

  return (
    <div
      role="tablist"
      aria-label={toggleLabel}
      className="inline-flex w-full max-w-sm rounded-full border border-zinc-300 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-800"
    >
      <Link
        href={calendarHrefPath(calendarHref)}
        role="tab"
        aria-selected={view === "calendar"}
        className={`${base} ${view === "calendar" ? active : idle}`}
      >
        {calendarLabel}
      </Link>
      <Link
        href={calendarHrefPath(listHref)}
        role="tab"
        aria-selected={view === "list"}
        className={`${base} ${view === "list" ? active : idle}`}
      >
        {listLabel}
      </Link>
    </div>
  );
}
