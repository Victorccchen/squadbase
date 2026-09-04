import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { AttendancePanel } from "@/components/credits/attendance-panel";
import {
  SessionDeletedBadge,
  SessionKindBadge,
  SessionPlayoffBadge,
  SessionStatusBadge,
} from "@/components/sessions/session-status-badge";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessRoster } from "@/lib/auth/roles";
import { getSession, listSessionRegistrations } from "@/lib/org/session-queries";
import {
  listActiveRosterForTeam,
  listAttendanceForSession,
  listBalancesForPlayers,
} from "@/lib/credits/queries";
import { creditsApplyToAgeBand } from "@/lib/credits/debit-rules";
import { formatClubDateTimeRange } from "@/lib/org/session-time";
import { secondaryButtonClassName } from "@/lib/ui";

type CoachSessionAttendancePageProps = {
  params: Promise<{ id: string }>;
};

export default async function CoachSessionAttendancePage({
  params,
}: CoachSessionAttendancePageProps) {
  const { roles } = await loadSignedInAccount();
  if (!canAccessRoster(roles)) {
    return <AccessDenied area="roster" />;
  }

  const { id } = await params;
  const session = await getSession(id);
  if (!session) {
    notFound();
  }

  const t = await getTranslations("credits");
  const sessionsT = await getTranslations("sessions");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const [registrations, attendance, roster] = await Promise.all([
    listSessionRegistrations(session.id),
    listAttendanceForSession(session.id),
    session.team_id ? listActiveRosterForTeam(session.team_id) : Promise.resolve([]),
  ]);

  const registered = registrations.filter((row) => row.status === "registered");
  const useRoster = session.kind === "cup" || session.kind === "league";
  const players = useRoster
    ? roster.map((row) => ({ player: row.player, jerseyNumber: row.membership.jersey_number }))
    : registered
        .filter((row) => row.player)
        .map((row) => ({
          player: row.player!,
          jerseyNumber:
            roster.find((item) => item.player.id === row.player_id)?.membership.jersey_number ?? null,
        }));

  const playerIds = players.map((row) => row.player.id);
  const balances = await listBalancesForPlayers(playerIds);
  const balanceByPlayer = new Map(balances.map((row) => [row.player_id, row.credits_available]));
  const attendanceByPlayer = new Map(attendance.map((row) => [row.player_id, row]));
  const teamBand = session.team?.age_band ?? "U8";
  const noDebitLabel = !creditsApplyToAgeBand(teamBand) || session.no_debit;

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={session.title}
          description={`${session.team?.name ?? org("unknownTeam")} · ${formatClubDateTimeRange(session.starts_at, session.ends_at, locale)}`}
          actions={
            <Link href="/app/roster" className={secondaryButtonClassName}>
              {t("backToRoster")}
            </Link>
          }
        />
        <div className="flex flex-wrap gap-2">
          <SessionKindBadge kind={session.kind} label={sessionsT(`kinds.${session.kind}`)} />
          {session.is_playoff ? <SessionPlayoffBadge label={sessionsT("playoff")} /> : null}
          {session.deleted_at ? (
            <SessionDeletedBadge label={sessionsT("deleted")} />
          ) : (
            <SessionStatusBadge
              status={session.status}
              label={org(session.status === "active" ? "statusActive" : "statusInactive")}
            />
          )}
          {noDebitLabel ? (
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {t("noDebit")}
            </span>
          ) : null}
        </div>
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t("attendanceTitle")}
          </h2>
          <AttendancePanel
            sessionId={session.id}
            next="roster"
            locale={locale}
            showCredits
            candidates={players.map((row) => {
              const marked = attendanceByPlayer.get(row.player.id);
              return {
                player: row.player,
                jerseyNumber: row.jerseyNumber,
                creditsAvailable: balanceByPlayer.get(row.player.id) ?? 0,
                attendanceStatus: marked?.status ?? null,
                creditsDebited: marked?.credits_debited ?? 0,
                noDebitLabel,
              };
            })}
          />
        </section>
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
