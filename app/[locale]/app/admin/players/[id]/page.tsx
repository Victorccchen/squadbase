import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { canRenderAdminPage } from "@/lib/auth/admin-page";
import { PlayerPhotoPanel } from "@/components/players/player-photo-panel";
import { getPlayer, formatActiveMembershipSummary } from "@/lib/org/queries";
import { signPlayerStoragePaths } from "@/lib/org/player-photo-queries";
import { photoAlertFromSearchParams } from "@/lib/org/player-photos";
import { localizedPlayerName, displayOptionalName } from "@/lib/org/display-name";
import { ageBandFromBirthDate, birthAgeLabelFromBirthDate, formatIsoDate, seasonStartForBirthDate } from "@/lib/age-band";
import { secondaryButtonClassName } from "@/lib/ui";

type PlayerDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photoAlert?: string | string[]; photoPlayer?: string | string[] }>;
};

export default async function PlayerDetailPage({ params, searchParams }: PlayerDetailPageProps) {
  if (!(await canRenderAdminPage())) {
    return <AccessDenied area="admin" />;
  }

  const { id } = await params;
  const player = await getPlayer(id);
  if (!player) {
    notFound();
  }

  const t = await getTranslations("admin");
  const org = await getTranslations("org");
  const common = await getTranslations("common");
  const locale = await getLocale();
  const band = ageBandFromBirthDate(player.birth_date);
  const birthAge = birthAgeLabelFromBirthDate(player.birth_date);
  const seasonStart = seasonStartForBirthDate();
  const signed = await signPlayerStoragePaths([player.photo_path]);
  const photoUrl = player.photo_path ? (signed.get(player.photo_path) ?? null) : null;
  const photoAlert = photoAlertFromSearchParams(await searchParams);
  const returnTo = `/${locale}/app/admin/players/${player.id}`;

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader
          title={localizedPlayerName(player, locale)}
          actions={
            <span className="flex flex-wrap gap-2">
              <Link
                href={`/app/assessments/${player.id}`}
                className={secondaryButtonClassName}
              >
                {t("openAssessment")}
              </Link>
              <Link
                href={`/app/admin/players/${player.id}/edit`}
                className={secondaryButtonClassName}
              >
                {t("edit")}
              </Link>
            </span>
          }
        />
        <dl className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-6 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("nameZh")}</dt>
            <dd className="font-medium">{displayOptionalName(player.name_zh)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("nameEnGiven")}</dt>
            <dd className="font-medium">{player.name_en_given}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("nameEnFamily")}</dt>
            <dd className="font-medium">{player.name_en_family}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("nameJa")}</dt>
            <dd className="font-medium">{displayOptionalName(player.name_ja)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("birthDate")}</dt>
            <dd className="font-medium">{player.birth_date}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("suggestedAgeSquad")}</dt>
            <dd className="font-medium">
              {band ? org(`ageBands.${band}`) : org("ageBandUnknown")}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("birthAgeLabel")}</dt>
            <dd className="font-medium">{birthAge ?? org("ageBandUnknown")}</dd>
          </div>
          {seasonStart ? (
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{org("seasonStart")}</dt>
              <dd className="font-medium">{formatIsoDate(seasonStart)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("continuesTraining")}</dt>
            <dd className="font-medium">
              {org(player.continues_training ? "continuesTrainingYes" : "continuesTrainingNo")}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("teams")}</dt>
            <dd className="text-right font-medium">
              {formatActiveMembershipSummary(player.memberships) ?? org("noTeam")}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{org("status")}</dt>
            <dd className="font-medium">
              {org(player.status === "active" ? "statusActive" : "statusInactive")}
            </dd>
          </div>
        </dl>
        <PlayerPhotoPanel
          playerId={player.id}
          photoPath={player.photo_path}
          idPdfPath={player.id_pdf_path}
          signedUrl={photoUrl}
          canWrite
          returnTo={returnTo}
          alertErrorKey={
            photoAlert && (!photoAlert.playerId || photoAlert.playerId === player.id)
              ? photoAlert.errorKey
              : null
          }
        />
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
