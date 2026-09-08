"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnnouncementCopyPanel } from "@/components/credits/announcement-copy-panel";
import { EmptyState } from "@/components/empty-state";
import {
  NOTICE_AUDIENCE_KEYS,
  NOTICE_TEMPLATE_KEYS,
  announcementFieldsFromSource,
  buildAnnouncementPastes,
  parseNoticeAudienceKey,
  parseNoticeTemplateKey,
  suggestedNoticeAudience,
  suggestedNoticeTemplate,
  type NoticeAudienceKey,
  type NoticeLocale,
  type NoticeSourceSnapshot,
  type NoticeTeamRef,
  type NoticeTemplateKey,
} from "@/lib/credits/notice-templates";
import { isAgeSquad, isCompetitionTeam } from "@/lib/org/squad-team";
import { formatClubDateTime, formatClubDateTimeRange } from "@/lib/org/session-time";
import { inputClassName } from "@/lib/ui";

export type NoticeTeamOption = NoticeTeamRef & {
  id: string;
  name: string;
};

type NoticeGeneratorProps = {
  sources: NoticeSourceSnapshot[];
  teams: NoticeTeamOption[];
  origin: string;
  initialSessionId: string | null;
  initialTemplate: NoticeTemplateKey | null;
  initialAudience: NoticeAudienceKey | null;
};

function teamMatchesAudience(team: NoticeTeamOption, audience: NoticeAudienceKey): boolean {
  if (audience === "age_squad") {
    return isAgeSquad(team);
  }
  if (audience === "competition_team") {
    return isCompetitionTeam(team);
  }
  return false;
}

export function NoticeGenerator({
  sources,
  teams,
  origin,
  initialSessionId,
  initialTemplate,
  initialAudience,
}: NoticeGeneratorProps) {
  const t = useTranslations("notices");
  const initialSource = sources.find((row) => row.id === initialSessionId) ?? null;
  const [sourceId, setSourceId] = useState(initialSource?.id ?? "");
  const source = sources.find((row) => row.id === sourceId) ?? null;
  const [template, setTemplate] = useState<NoticeTemplateKey>(
    initialTemplate ??
      (source ? suggestedNoticeTemplate(source.kind, source.publicStatus) : "regular_training_signup"),
  );
  const [audience, setAudience] = useState<NoticeAudienceKey>(
    initialAudience ?? suggestedNoticeAudience(source?.teamKind),
  );
  const [teamId, setTeamId] = useState(source?.teamId ?? "");
  const [copyLocale, setCopyLocale] = useState<NoticeLocale>("zh-Hant");
  const [kit, setKit] = useState("");
  const [gear, setGear] = useState("");
  const [gather, setGather] = useState("");
  const [recap, setRecap] = useState(source?.recap ?? "");

  const audienceTeams = teams.filter((team) => teamMatchesAudience(team, audience));
  const selectedTeam =
    audience === "session_registrations"
      ? (teams.find((team) => team.id === source?.teamId) ?? null)
      : (audienceTeams.find((team) => team.id === teamId) ??
        audienceTeams.find((team) => team.id === source?.teamId) ??
        null);

  const pastes = source
    ? buildAnnouncementPastes(
        copyLocale,
        template,
        announcementFieldsFromSource(source, {
          origin,
          locale: copyLocale,
          timeRange: formatClubDateTimeRange(source.startsAt, source.endsAt, copyLocale),
          deadline: formatClubDateTime(source.startsAt, copyLocale),
          kit,
          gear,
          gather,
          recap,
        }),
        {
          audience,
          sourceTeam: {
            id: source.teamId,
            name: source.teamName,
            kind: source.teamKind,
            age_band: source.teamAgeBand,
            eligible_birth_ages: source.eligibleBirthAges,
          },
          selectedTeam,
        },
      )
    : [];

  function onSourceChange(nextId: string) {
    setSourceId(nextId);
    const next = sources.find((row) => row.id === nextId);
    if (!next) {
      return;
    }
    setTemplate(suggestedNoticeTemplate(next.kind, next.publicStatus));
    setAudience(suggestedNoticeAudience(next.teamKind));
    setTeamId(next.teamId);
    setRecap(next.recap);
  }

  function onAudienceChange(next: string) {
    const parsed = parseNoticeAudienceKey(next);
    if (!parsed) {
      return;
    }
    setAudience(parsed);
    const nextTeams = teams.filter((team) => teamMatchesAudience(team, parsed));
    const keep = nextTeams.some((team) => team.id === teamId);
    if (!keep) {
      setTeamId(
        source?.teamId && nextTeams.some((team) => team.id === source.teamId) ? source.teamId : "",
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {t("title")}
        </legend>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("sourceLabel")}
          <select
            className={inputClassName}
            value={sourceId}
            onChange={(event) => onSourceChange(event.target.value)}
          >
            <option value="">{t("sourcePlaceholder")}</option>
            {sources.map((row) => (
              <option key={row.id} value={row.id}>
                {row.title} · {row.teamName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("templateLabel")}
          <select
            className={inputClassName}
            value={template}
            onChange={(event) => {
              const parsed = parseNoticeTemplateKey(event.target.value);
              if (parsed) {
                setTemplate(parsed);
              }
            }}
          >
            {NOTICE_TEMPLATE_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`templates.${key}`)}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t("audienceLabel")}</legend>
          <div className="flex flex-col gap-2">
            {NOTICE_AUDIENCE_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="audience"
                  value={key}
                  checked={audience === key}
                  onChange={(event) => onAudienceChange(event.target.value)}
                />
                {t(`audiences.${key}`)}
              </label>
            ))}
          </div>
        </fieldset>
        {audience === "session_registrations" ? null : (
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("teamLabel")}
            <select
              className={inputClassName}
              value={selectedTeam?.id ?? ""}
              onChange={(event) => setTeamId(event.target.value)}
            >
              <option value="">{t("teamPlaceholder")}</option>
              {audienceTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {source ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {t("registeredMeta", { count: source.registeredCount })}
          </p>
        ) : null}
        {template === "match_notes" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("gather")}
              <input
                className={inputClassName}
                value={gather}
                onChange={(event) => setGather(event.target.value)}
                placeholder={t("gatherPlaceholder")}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("kit")}
              <input
                className={inputClassName}
                value={kit}
                onChange={(event) => setKit(event.target.value)}
                placeholder={t("kitPlaceholder")}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("gear")}
              <input
                className={inputClassName}
                value={gear}
                onChange={(event) => setGear(event.target.value)}
                placeholder={t("gearPlaceholder")}
              />
            </label>
          </div>
        ) : null}
        {template === "match_report" ? (
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("recap")}
            <textarea
              className={inputClassName}
              rows={3}
              value={recap}
              onChange={(event) => setRecap(event.target.value)}
              placeholder={t("recapPlaceholder")}
            />
          </label>
        ) : null}
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("noPiiHint")}</p>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("noSendHint")}</p>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("coexistHint")}</p>
      </fieldset>
      {!source ? (
        <EmptyState title={t("noSourceTitle")} body={t("noSourceBody")} />
      ) : (
        <AnnouncementCopyPanel
          pastes={pastes}
          copyLocale={copyLocale}
          onCopyLocaleChange={setCopyLocale}
          localeLabel={(code) => t(`locales.${code}`)}
          copyLabel={t("copy")}
          copiedLabel={t("copied")}
          copyLocaleLabel={t("copyLocaleLabel")}
          pasteForGroup={(band) => t("pasteForGroup", { band })}
          dualPasteHint={pastes.length > 1 ? t("dualPasteHint") : null}
          previewTitle={t("previewTitle")}
        />
      )}
    </div>
  );
}
