import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/empty-state";
import { QuestionForm } from "@/components/sessions/question-form";
import { MessageThread } from "@/components/sessions/message-thread";
import { RegistrationStatusBadge } from "@/components/sessions/session-status-badge";
import { localizedPlayerName, playerNameList } from "@/lib/org/display-name";
import type { SessionRegistrationWithDetails } from "@/lib/org/session-queries";

type AdminSessionRegistrationsProps = {
  registrations: SessionRegistrationWithDetails[];
  sessionId: string;
  locale: string;
  variant?: "session" | "match";
  allowReply?: boolean;
};

export async function AdminSessionRegistrations({
  registrations,
  sessionId,
  locale,
  variant = "session",
  allowReply = true,
}: AdminSessionRegistrationsProps) {
  const t = await getTranslations("admin");
  const matchesT = await getTranslations("matches");
  const sessionsT = await getTranslations("sessions");
  const open = registrations.filter((row) => row.status === "registered");
  const history = registrations.filter((row) => row.status !== "registered");
  const title = variant === "match" ? matchesT("parentRegistrationsTitle") : t("rosterTitle");
  const emptyTitle =
    variant === "match" ? matchesT("parentRegistrationsEmptyTitle") : t("rosterEmptyTitle");
  const emptyBody =
    variant === "match" ? matchesT("parentRegistrationsEmptyBody") : t("rosterEmptyBody");

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
        {variant === "match" ? (
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {matchesT("parentRegistrationsHint")}
          </p>
        ) : null}
        {open.length === 0 ? (
          <EmptyState title={emptyTitle} body={emptyBody} />
        ) : (
          <ul className="grid gap-3">
            {open.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <RegistrationStatusBadge
                    status={row.status}
                    label={sessionsT(`statuses.${row.status}`)}
                  />
                  <span className="font-medium">
                    {row.player ? localizedPlayerName(row.player, locale) : sessionsT("unknownPlayer")}
                  </span>
                </div>
                {row.player ? (
                  <p className="text-sm text-zinc-500">{playerNameList(row.player)}</p>
                ) : null}
                {row.parent_note ? (
                  <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                    {sessionsT("parentNote")}: {row.parent_note}
                  </p>
                ) : null}
                <div className="flex flex-col gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {sessionsT("qaTitle")}
                  </h3>
                  <MessageThread messages={row.messages} locale={locale} />
                  {allowReply ? (
                    <QuestionForm
                      registrationId={row.id}
                      sessionId={sessionId}
                      authorRole="admin"
                      next={variant === "match" ? "match" : "session"}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {history.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("registrationHistoryTitle")}
          </h2>
          <ul className="grid gap-3">
            {history.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <RegistrationStatusBadge
                    status={row.status}
                    label={sessionsT(`statuses.${row.status}`)}
                  />
                  <span className="font-medium">
                    {row.player ? localizedPlayerName(row.player, locale) : sessionsT("unknownPlayer")}
                  </span>
                </div>
                <MessageThread messages={row.messages} locale={locale} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
