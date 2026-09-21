"use client";

import {
  useEffect,
  useOptimistic,
  useTransition,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  calendarHrefPath,
  type AdminSessionsView,
  type CalendarListHref,
} from "@/lib/org/session-calendar";

type SessionSurfaceProps = {
  view: AdminSessionsView;
  calendarHref: CalendarListHref;
  listHref: CalendarListHref;
  calendarLabel: string;
  listLabel: string;
  toggleLabel: string;
  instantToggle: boolean;
  list: ReactNode;
  calendar: ReactNode;
  toolbar?: ReactNode;
};

function isCalendarView(view: AdminSessionsView): boolean {
  switch (view) {
    case "calendar":
      return true;
    case "list":
      return false;
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}

function isModifiedClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

export function SessionSurface({
  view,
  calendarHref,
  listHref,
  calendarLabel,
  listLabel,
  toggleLabel,
  instantToggle,
  list,
  calendar,
  toolbar,
}: SessionSurfaceProps) {
  const router = useRouter();
  const [optimisticView, setOptimisticView] = useOptimistic(view);
  const [isPending, startTransition] = useTransition();
  const calendarPath = calendarHrefPath(calendarHref);
  const listPath = calendarHrefPath(listHref);
  const showCalendar = isCalendarView(optimisticView);

  useEffect(() => {
    router.prefetch(showCalendar ? listPath : calendarPath);
  }, [router, showCalendar, calendarPath, listPath]);

  function select(next: AdminSessionsView) {
    if (next === optimisticView) {
      return;
    }
    const href = isCalendarView(next) ? calendarPath : listPath;
    startTransition(() => {
      setOptimisticView(next);
      router.replace(href, { scroll: false });
    });
  }

  const base =
    "inline-flex flex-1 items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium";
  const active = "bg-foreground text-background shadow-sm";
  const idle = "text-zinc-700 hover:bg-white/80 dark:text-zinc-200 dark:hover:bg-zinc-900/80";

  return (
    <div className="flex flex-col gap-8" aria-busy={isPending && !instantToggle}>
      <div
        role="tablist"
        aria-label={toggleLabel}
        className="inline-flex w-full max-w-sm rounded-full border border-zinc-300 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-800"
      >
        <Link
          href={calendarPath}
          prefetch
          scroll={false}
          role="tab"
          aria-selected={showCalendar}
          className={`${base} ${showCalendar ? active : idle}`}
          onClick={(event) => {
            if (isModifiedClick(event)) {
              return;
            }
            event.preventDefault();
            select("calendar");
          }}
        >
          {calendarLabel}
        </Link>
        <Link
          href={listPath}
          prefetch
          scroll={false}
          role="tab"
          aria-selected={!showCalendar}
          className={`${base} ${showCalendar ? idle : active}`}
          onClick={(event) => {
            if (isModifiedClick(event)) {
              return;
            }
            event.preventDefault();
            select("list");
          }}
        >
          {listLabel}
        </Link>
      </div>
      {toolbar}
      {instantToggle ? (
        <>
          <div hidden={showCalendar}>{list}</div>
          <div hidden={!showCalendar}>{calendar}</div>
        </>
      ) : showCalendar ? (
        calendar
      ) : (
        list
      )}
    </div>
  );
}
