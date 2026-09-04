import { getTranslations } from "next-intl/server";
import { AttendanceMarkForm } from "@/components/credits/attendance-mark-form";
import { localizedPlayerName } from "@/lib/org/display-name";
import type { AttendanceStatus } from "@/lib/credits/debit-rules";
import type { Player } from "@/lib/supabase/database.types";

export type AttendanceCandidate = {
  player: Player;
  jerseyNumber: number | null;
  creditsAvailable: number | null;
  attendanceStatus: AttendanceStatus | null;
  creditsDebited: number;
  noDebitLabel: boolean;
};

type AttendancePanelProps = {
  sessionId: string;
  next: "admin" | "roster";
  locale: string;
  candidates: AttendanceCandidate[];
  showCredits: boolean;
};

export async function AttendancePanel({
  sessionId,
  next,
  locale,
  candidates,
  showCredits,
}: AttendancePanelProps) {
  const t = await getTranslations("credits");

  if (candidates.length === 0) {
    return <p className="text-sm text-zinc-500">{t("attendanceEmpty")}</p>;
  }

  return (
    <ul className="grid gap-3">
      {candidates.map((row) => (
        <li
          key={row.player.id}
          className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex flex-col gap-1">
            <span className="font-medium">
              {row.jerseyNumber !== null ? `#${row.jerseyNumber} ` : ""}
              {localizedPlayerName(row.player, locale)}
            </span>
            <span className="text-sm text-zinc-500">
              {row.noDebitLabel
                ? t("noDebit")
                : row.attendanceStatus
                  ? `${t(`attendance.${row.attendanceStatus}`)} · ${t("debitedCredits", { count: row.creditsDebited })}`
                  : t("attendanceUnmarked")}
              {showCredits && row.creditsAvailable !== null
                ? ` · ${t("remainingCredits", { count: row.creditsAvailable })}`
                : ""}
            </span>
          </div>
          <AttendanceMarkForm sessionId={sessionId} playerId={row.player.id} next={next} />
        </li>
      ))}
    </ul>
  );
}
