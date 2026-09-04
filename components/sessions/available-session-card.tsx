import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { SessionListActions } from "@/components/sessions/session-list-actions";
import {
  SessionKindBadge,
  SessionPlayoffBadge,
  SessionStatusBadge,
} from "@/components/sessions/session-status-badge";
import type { SessionKind } from "@/lib/supabase/database.types";
import { formatClubDateTimeRange } from "@/lib/org/session-time";

export type SessionCardChild = {
  playerId: string;
  playerName: string;
  registrationId: string | null;
};

type AvailableSessionCardProps = {
  sessionId: string;
  title: string;
  teamName: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  kind: SessionKind;
  isPlayoff: boolean;
  childrenOnTeam: SessionCardChild[];
  locale: string;
};

export async function AvailableSessionCard({
  sessionId,
  title,
  teamName,
  location,
  startsAt,
  endsAt,
  kind,
  isPlayoff,
  childrenOnTeam,
  locale,
}: AvailableSessionCardProps) {
  const t = await getTranslations("sessions");
  const org = await getTranslations("org");
  const singleChild = childrenOnTeam.length === 1 ? childrenOnTeam[0] : null;

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{title}</span>
            <span className="flex flex-wrap items-center gap-2">
              <SessionKindBadge kind={kind} label={t(`kinds.${kind}`)} />
              {isPlayoff ? <SessionPlayoffBadge label={t("playoff")} /> : null}
              <SessionStatusBadge status="active" label={org("statusActive")} />
            </span>
          </div>
          <p className="text-sm text-zinc-500">
            {teamName}
            {" · "}
            {formatClubDateTimeRange(startsAt, endsAt, locale)}
          </p>
          {location ? <p className="text-sm text-zinc-500">{location}</p> : null}
          <Link
            href={`/app/sessions/${sessionId}`}
            className="text-sm font-medium underline underline-offset-2"
          >
            {t("viewSession")}
          </Link>
        </div>
        {singleChild ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <SessionListActions
              sessionId={sessionId}
              playerId={singleChild.playerId}
              startsAt={startsAt}
              registrationId={singleChild.registrationId}
            />
          </div>
        ) : null}
      </div>
      {childrenOnTeam.length > 1 ? (
        <ul className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          {childrenOnTeam.map((child) => (
            <li
              key={child.playerId}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span className="text-sm font-medium">{child.playerName}</span>
              <SessionListActions
                sessionId={sessionId}
                playerId={child.playerId}
                startsAt={startsAt}
                registrationId={child.registrationId}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
