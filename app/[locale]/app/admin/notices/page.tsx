import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { NoticeGenerator } from "@/components/admin/notice-generator";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { publicAppOrigin } from "@/lib/credits/queries";
import {
  parseNoticeAudienceKey,
  parseNoticeTemplateKey,
  type NoticeSourceSnapshot,
} from "@/lib/credits/notice-templates";
import { formatMatchScore } from "@/lib/org/match";
import { listMatchesForAdmin, getMatchForStaff, type MatchAdminRow } from "@/lib/org/match-queries";
import { parseUuid } from "@/lib/org/parse";
import { listTeams } from "@/lib/org/queries";
import {
  getSession,
  listSessionRegistrations,
  listSessionsForAdmin,
  type TrainingSessionAdminRow,
} from "@/lib/org/session-queries";
import { TRAINING_SESSION_KINDS } from "@/lib/org/session-recurrence";

type AdminNoticesPageProps = {
  searchParams: Promise<{
    session?: string | string[];
    template?: string | string[];
    audience?: string | string[];
  }>;
};

function firstQuery(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function snapshotFromSession(session: TrainingSessionAdminRow): NoticeSourceSnapshot {
  return {
    id: session.id,
    title: session.title,
    kind: session.kind,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    location: session.location ?? "",
    teamId: session.team_id,
    teamName: session.team?.name ?? "",
    teamKind: session.team?.kind ?? null,
    teamAgeBand: session.team?.age_band ?? null,
    eligibleBirthAges: session.team?.eligible_birth_ages ?? [],
    registeredCount: session.registeredCount,
    opponent: "",
    score: "",
    recap: "",
    publicStatus: null,
  };
}

function snapshotFromMatch(match: MatchAdminRow): NoticeSourceSnapshot {
  return {
    id: match.id,
    title: match.title,
    kind: match.kind,
    startsAt: match.starts_at,
    endsAt: match.ends_at,
    location: match.location ?? "",
    teamId: match.team_id,
    teamName: match.team?.name ?? "",
    teamKind: match.team?.kind ?? null,
    teamAgeBand: match.team?.age_band ?? null,
    eligibleBirthAges: match.team?.eligible_birth_ages ?? [],
    registeredCount: match.registeredCount,
    opponent: match.publication.opponent ?? "",
    score: formatMatchScore(match.publication.club_score, match.publication.opponent_score) ?? "",
    recap: match.publication.result_note ?? "",
    publicStatus: match.publication.public_status,
  };
}

function noticeWindow(): { startsFrom: string; startsToExclusive: string } {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 14);
  const to = new Date();
  to.setUTCDate(to.getUTCDate() + 60);
  return { startsFrom: from.toISOString(), startsToExclusive: to.toISOString() };
}

export default async function AdminNoticesPage({ searchParams }: AdminNoticesPageProps) {
  const [allowed, params] = await Promise.all([canRenderAdminPage(), searchParams]);
  if (!allowed) {
    return <AccessDenied area="admin" />;
  }

  const sessionId = parseUuid(firstQuery(params.session));
  const initialTemplate = parseNoticeTemplateKey(firstQuery(params.template));
  const initialAudience = parseNoticeAudienceKey(firstQuery(params.audience));
  const window = noticeWindow();

  const [t, noticesT, common, teams, sessions, matches, focusedSession, focusedMatch, focusedRegs] =
    await Promise.all([
      getTranslations("admin"),
      getTranslations("notices"),
      getTranslations("common"),
      listTeams(),
      listSessionsForAdmin({
        kinds: [...TRAINING_SESSION_KINDS],
        startsFrom: window.startsFrom,
        startsToExclusive: window.startsToExclusive,
      }),
      listMatchesForAdmin({
        startsFrom: window.startsFrom,
        startsToExclusive: window.startsToExclusive,
      }),
      sessionId ? getSession(sessionId) : Promise.resolve(null),
      sessionId ? getMatchForStaff(sessionId) : Promise.resolve(null),
      sessionId ? listSessionRegistrations(sessionId) : Promise.resolve([]),
    ]);

  const byId = new Map<string, NoticeSourceSnapshot>();
  for (const row of sessions) {
    byId.set(row.id, snapshotFromSession(row));
  }
  for (const row of matches) {
    byId.set(row.id, snapshotFromMatch(row));
  }
  if (focusedMatch) {
    byId.set(focusedMatch.id, {
      ...snapshotFromMatch(focusedMatch),
      registeredCount: focusedRegs.filter((row) => row.status === "registered").length,
    });
  } else if (focusedSession) {
    byId.set(focusedSession.id, {
      ...snapshotFromSession({
        ...focusedSession,
        registeredCount: focusedRegs.filter((row) => row.status === "registered").length,
      }),
    });
  }

  const sources = [...byId.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("noticesTitle")} description={noticesT("lead")} />
        <NoticeGenerator
          sources={sources}
          teams={teams.map((team) => ({
            id: team.id,
            name: team.name,
            kind: team.kind,
            age_band: team.age_band,
            eligible_birth_ages: team.eligible_birth_ages,
          }))}
          origin={publicAppOrigin()}
          initialSessionId={sessionId}
          initialTemplate={initialTemplate}
          initialAudience={initialAudience}
        />
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
