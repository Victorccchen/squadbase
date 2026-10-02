import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { TaskDecisionButtons } from "@/components/admin/task-decision-buttons";
import { localizedPlayerName } from "@/lib/org/display-name";
import { taskKindMessageKey } from "@/lib/tasks/model";
import type { TaskInboxItem } from "@/lib/tasks/queries";

function formatTaipei(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Admin home: what needs a person, oldest first. Empty state when clear. */
export async function TaskInbox({ items }: { items: TaskInboxItem[] }) {
  const t = await getTranslations("tasks");
  const locale = await getLocale();

  return (
    <section aria-labelledby="task-inbox-title" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="task-inbox-title" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <span className="text-sm text-zinc-500">{t("count", { count: items.length })}</span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map(({ task, href, player }) => (
            <li
              key={task.id}
              className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1 text-sm">
                <span className="font-medium">
                  {t(`kinds.${taskKindMessageKey(task.kind)}`)}
                  {player ? ` · ${localizedPlayerName(player, locale)}` : ""}
                </span>
                <span className="text-zinc-500">
                  {task.due_at
                    ? t("dueAt", { time: formatTaipei(task.due_at, locale) })
                    : t("createdAt", { time: formatTaipei(task.created_at, locale) })}
                </span>
                {href ? (
                  <Link href={href} className="w-fit text-sm font-medium underline underline-offset-4">
                    {t("open")}
                  </Link>
                ) : null}
              </div>
              <TaskDecisionButtons taskId={task.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
