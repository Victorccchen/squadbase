import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SESSION_KINDS } from "@/lib/org/session-recurrence";
import { SESSION_KIND_DOT_CLASS } from "@/lib/org/session-kind-colors";

export async function SessionKindLegend() {
  const t = await getTranslations("sessions");
  const admin = await getTranslations("admin");

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {admin("calendarLegend")}
      </p>
      <ul className="flex flex-wrap gap-3 text-sm">
        {SESSION_KINDS.map((kind) => (
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
}: {
  calendarHref: { pathname: "/app/admin/sessions"; query: Record<string, string | string[]> };
  listHref: { pathname: "/app/admin/sessions"; query: Record<string, string | string[]> };
  view: "calendar" | "list";
  calendarLabel: string;
  listLabel: string;
}) {
  const base =
    "inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium";
  const active = "bg-foreground text-background";
  const idle =
    "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

  return (
    <div className="flex flex-wrap gap-2">
      <Link href={calendarHref} className={`${base} ${view === "calendar" ? active : idle}`}>
        {calendarLabel}
      </Link>
      <Link href={listHref} className={`${base} ${view === "list" ? active : idle}`}>
        {listLabel}
      </Link>
    </div>
  );
}
