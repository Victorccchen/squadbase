import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/page-header";
import { AssessmentReadView } from "@/components/assessments/assessment-read-view";
import { AssessmentForm } from "@/components/assessments/assessment-form";
import { AssessmentDeleteForm } from "@/components/assessments/assessment-delete-form";
import { updatePlayerAssessment } from "@/lib/assessments/actions";
import {
  getPlayerAssessmentEvent,
  listLinkableSessionsForPlayer,
  staffCanWritePlayerAssessment,
  type AssessmentLinkSession,
} from "@/lib/assessments/queries";
import { formatIsoDate, todayInClubTimeZone } from "@/lib/age-band";
import { formatClubDateWithWeekday, formatClubTime } from "@/lib/org/session-time";
import { getPlayer } from "@/lib/org/queries";
import { getSession } from "@/lib/org/session-queries";
import { localizedPlayerName } from "@/lib/org/display-name";
import { secondaryButtonClassName } from "@/lib/ui";

type AssessmentDetailPageProps = {
  params: Promise<{ playerId: string; assessmentId: string }>;
};

function sessionOptionLabel(session: AssessmentLinkSession, locale: string): string {
  const when = `${formatClubDateWithWeekday(session.starts_at, locale)} ${formatClubTime(session.starts_at, locale)}`;
  const team = session.team_name ? ` · ${session.team_name}` : "";
  return `${when} · ${session.title}${team}`;
}

export default async function AssessmentDetailPage({
  params,
}: AssessmentDetailPageProps) {
  const { playerId, assessmentId } = await params;
  const player = await getPlayer(playerId);
  if (!player) {
    notFound();
  }

  const [event, canWrite, sessions] = await Promise.all([
    getPlayerAssessmentEvent(player.id, assessmentId),
    staffCanWritePlayerAssessment(player.id),
    listLinkableSessionsForPlayer(player.id),
  ]);
  if (!event) {
    notFound();
  }

  const t = await getTranslations("assessments");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const linkedSession = event.session_id ? await getSession(event.session_id) : null;
  const sessionOptions = [...sessions];
  if (linkedSession && !sessionOptions.some((session) => session.id === linkedSession.id)) {
    sessionOptions.unshift({
      id: linkedSession.id,
      title: linkedSession.title,
      kind: linkedSession.kind,
      starts_at: linkedSession.starts_at,
      team_id: linkedSession.team_id,
      team_name: linkedSession.team?.name ?? null,
    });
  }
  const sessionLabels = Object.fromEntries(
    sessionOptions.map((session) => [session.id, sessionOptionLabel(session, locale)]),
  );

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={t("detailTitle", { name: localizedPlayerName(player, locale) })}
          description={canWrite ? t("editLead") : t("readOnlyLead")}
          actions={
            <Link
              href={`/app/assessments/${player.id}`}
              className={secondaryButtonClassName}
            >
              {t("backToHistory")}
            </Link>
          }
        />
        {canWrite ? (
          <>
            <AssessmentForm
              playerId={player.id}
              defaultAssessedOn={formatIsoDate(todayInClubTimeZone())}
              event={event}
              sessions={sessionOptions}
              sessionLabels={sessionLabels}
              action={updatePlayerAssessment.bind(null, event.id)}
            />
            <AssessmentDeleteForm playerId={player.id} assessmentId={event.id} />
          </>
        ) : (
          <AssessmentReadView
            event={event}
            sessionLabel={
              event.session_id ? sessionLabels[event.session_id] ?? null : null
            }
          />
        )}
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
