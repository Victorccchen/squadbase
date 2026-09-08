import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  calendarHrefPath,
  defaultUpcomingListWindow,
  expandListDateWindow,
  isDefaultUpcomingListWindow,
  listWindowHref,
  type AdminSessionsQuery,
  type CalendarListPath,
  type ListDateWindow,
} from "@/lib/org/session-calendar";
import { quietButtonClassName, secondaryButtonClassName } from "@/lib/ui";

type ListWindowNavProps = {
  pathname: CalendarListPath;
  query: AdminSessionsQuery;
  window: ListDateWindow;
  hasEarlier: boolean;
  hasLater: boolean;
};

export async function ListWindowNav({
  pathname,
  query,
  window,
  hasEarlier,
  hasLater,
}: ListWindowNavProps) {
  const t = await getTranslations("admin");
  const earlier = expandListDateWindow(window, "earlier");
  const later = expandListDateWindow(window, "later");
  const defaults = defaultUpcomingListWindow();
  const showReset = !isDefaultUpcomingListWindow(window);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-500">
        {t("listWindowHint", { from: window.from, to: window.to })}
      </p>
      {hasEarlier || hasLater || showReset ? (
        <div className="flex flex-wrap gap-2">
          {hasEarlier ? (
            <Link
              href={calendarHrefPath(listWindowHref(pathname, query, earlier))}
              className={secondaryButtonClassName}
            >
              {t("seeEarlier")}
            </Link>
          ) : null}
          {hasLater ? (
            <Link
              href={calendarHrefPath(listWindowHref(pathname, query, later))}
              className={secondaryButtonClassName}
            >
              {t("loadMore")}
            </Link>
          ) : null}
          {showReset ? (
            <Link
              href={calendarHrefPath(listWindowHref(pathname, query, defaults))}
              className={quietButtonClassName}
            >
              {t("resetListWindow")}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
