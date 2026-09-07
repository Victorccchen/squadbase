import { Link } from "@/i18n/navigation";
import { SessionKindBadge, SessionPlayoffBadge } from "@/components/sessions/session-status-badge";
import { MatchSideBadge, MatchStatusBadge } from "@/components/matches/match-status-badge";
import { formatClubDateTime } from "@/lib/org/session-time";
import { formatMatchScore } from "@/lib/org/match";
import type { PublishedMatch } from "@/lib/supabase/database.types";

type PublicMatchCardProps = {
  match: PublishedMatch;
  locale: string;
  kindLabel: string;
  playoffLabel: string;
  statusLabel: string;
  sideLabel: string;
  vsLabel: string;
};

export function PublicMatchCard({
  match,
  locale,
  kindLabel,
  playoffLabel,
  statusLabel,
  sideLabel,
  vsLabel,
}: PublicMatchCardProps) {
  const score = formatMatchScore(match.club_score, match.opponent_score);

  return (
    <Link
      href={`/matches/${match.id}`}
      className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-wrap items-center gap-2">
        <SessionKindBadge kind={match.kind} label={kindLabel} />
        {match.is_playoff ? <SessionPlayoffBadge label={playoffLabel} /> : null}
        <MatchStatusBadge status={match.public_status} label={statusLabel} />
        <MatchSideBadge label={sideLabel} />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{match.title}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {match.team_name} {vsLabel} {match.opponent}
        </p>
      </div>
      <p className="text-sm text-zinc-500">{formatClubDateTime(match.starts_at, locale)}</p>
      {match.location ? <p className="text-sm text-zinc-500">{match.location}</p> : null}
      {score ? <p className="text-sm font-medium">{score}</p> : null}
    </Link>
  );
}
