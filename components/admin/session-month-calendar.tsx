import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  ISO_WEEKDAYS,
} from "@/lib/org/session-recurrence";
import {
  adminSessionsHref,
  defaultDayForMonth,
  monthGrid,
  shiftYearMonth,
  uniqueAgeBandAbbrevsOnDate,
  uniqueKindsOnDate,
  type AdminSessionsQuery,
  type CalendarSession,
} from "@/lib/org/session-calendar";
import { SESSION_KIND_DOT_CLASS } from "@/lib/org/session-kind-colors";
import { formatClubMonth } from "@/lib/org/session-time";
import { SessionKindLegend } from "@/components/admin/session-kind-legend";

type SessionMonthCalendarProps = {
  query: AdminSessionsQuery;
  sessions: CalendarSession[];
  today: string;
};

export async function SessionMonthCalendar({
  query,
  sessions,
  today,
}: SessionMonthCalendarProps) {
  const t = await getTranslations("sessions");
  const admin = await getTranslations("admin");
  const locale = await getLocale();
  const grid = monthGrid(query.year, query.month);
  const prev = shiftYearMonth(query.year, query.month, -1);
  const next = shiftYearMonth(query.year, query.month, 1);
  const prevHref = adminSessionsHref({
    ...query,
    year: prev.year,
    month: prev.month,
    day: defaultDayForMonth(prev.year, prev.month, today),
  });
  const nextHref = adminSessionsHref({
    ...query,
    year: next.year,
    month: next.month,
    day: defaultDayForMonth(next.year, next.month, today),
  });

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={prevHref}
          className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {admin("prevMonth")}
        </Link>
        <h2 className="text-lg font-semibold">
          {formatClubMonth(query.year, query.month, locale)}
        </h2>
        <Link
          href={nextHref}
          className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {admin("nextMonth")}
        </Link>
      </div>
      <SessionKindLegend />
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase tracking-wide text-zinc-500">
        {ISO_WEEKDAYS.map((weekday) => (
          <div key={weekday} className="py-1">
            {t(`weekdaysShort.${weekday}`)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {grid.map((cell) => {
          const kinds = uniqueKindsOnDate(sessions, cell.date);
          const abbrevs = uniqueAgeBandAbbrevsOnDate(sessions, cell.date);
          const selected = cell.date === query.day;
          const isToday = cell.date === today;
          const parts = cell.date.split("-");
          const href = adminSessionsHref({
            ...query,
            year: Number(parts[0]),
            month: Number(parts[1]),
            day: cell.date,
            view: "calendar",
          });
          return (
            <Link
              key={cell.date}
              href={href}
              aria-current={selected ? "date" : undefined}
              aria-label={cell.date}
              className={`flex min-h-16 flex-col items-center gap-1 rounded-xl border px-1 py-1.5 text-sm ${
                selected
                  ? "border-foreground bg-zinc-100 dark:bg-zinc-800"
                  : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-700"
              } ${cell.inMonth ? "" : "opacity-45"}`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full ${
                  isToday ? "bg-foreground text-background" : ""
                }`}
              >
                {cell.dayOfMonth}
              </span>
              {kinds.length > 0 ? (
                <span className="flex flex-wrap items-center justify-center gap-0.5">
                  {kinds.map((kind) => (
                    <span
                      key={kind}
                      className={`h-1.5 w-1.5 rounded-full ${SESSION_KIND_DOT_CLASS[kind]}`}
                    />
                  ))}
                </span>
              ) : (
                <span className="h-1.5" />
              )}
              {abbrevs.length > 1 ? (
                <span className="max-w-full truncate text-[10px] leading-none text-zinc-500">
                  {abbrevs.join(" ")}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
