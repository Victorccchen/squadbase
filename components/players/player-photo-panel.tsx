import { getTranslations } from "next-intl/server";
import { HeadshotResizeEnhancer } from "@/components/players/headshot-resize-enhancer";
import { PlayerPhotoThumb } from "@/components/players/player-photo-thumb";
import {
  removePlayerHeadshot,
  removePlayerIdPdf,
  uploadPlayerHeadshot,
  uploadPlayerIdPdf,
} from "@/lib/org/player-photo-actions";
import type { OrgErrorKey } from "@/lib/org/errors";
import { playerHasHeadshot, playerHasIdPdf, photoSectionDomId } from "@/lib/org/player-photos";
import {
  dangerButtonClassName,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "@/lib/ui";

type PlayerPhotoPanelProps = {
  playerId: string;
  photoPath: string | null | undefined;
  idPdfPath: string | null | undefined;
  signedUrl: string | null;
  canWrite: boolean;
  returnTo: string;
  alertErrorKey?: OrgErrorKey | null;
};

export async function PlayerPhotoPanel({
  playerId,
  photoPath,
  idPdfPath,
  signedUrl,
  canWrite,
  returnTo,
  alertErrorKey,
}: PlayerPhotoPanelProps) {
  const t = await getTranslations("photos");
  const org = await getTranslations("org");
  const hasPhoto = playerHasHeadshot({ photo_path: photoPath });
  const hasPdf = playerHasIdPdf({ id_pdf_path: idPdfPath });
  const sectionId = photoSectionDomId(playerId);
  const headingId = `${sectionId}-title`;
  const headshotInputId = `${sectionId}-headshot`;

  return (
    <section
      id={sectionId}
      data-testid="player-photo-section"
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-xl border-2 border-zinc-800 bg-zinc-100 p-4 dark:border-zinc-200 dark:bg-zinc-950"
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
          {t("title")}
        </h2>
        <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">{t("privacyHint")}</p>
      </div>
      <PlayerPhotoThumb
        url={signedUrl}
        alt={t("previewAlt")}
        missingLabel={t("missing")}
        hasPdf={hasPdf}
        pdfLabel={t("hasPdf")}
        size="md"
      />
      {alertErrorKey ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100"
        >
          {org(`errors.${alertErrorKey}`)}
        </p>
      ) : null}
      {canWrite ? (
        <>
          <form action={uploadPlayerHeadshot} encType="multipart/form-data" className="flex max-w-xl flex-col gap-3">
            <input type="hidden" name="player_id" value={playerId} />
            <input type="hidden" name="return_to" value={returnTo} />
            <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor={headshotInputId}>
              {t("chooseImage")}
              <input
                id={headshotInputId}
                name="headshot"
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                required
                className={inputClassName}
              />
              <span className="font-normal text-zinc-600 dark:text-zinc-400">{t("imageHint")}</span>
            </label>
            <HeadshotResizeEnhancer inputId={headshotInputId} />
            <button type="submit" className={primaryButtonClassName}>
              {hasPhoto ? t("replace") : t("upload")}
            </button>
          </form>
          {hasPhoto ? (
            <form action={removePlayerHeadshot}>
              <input type="hidden" name="player_id" value={playerId} />
              <input type="hidden" name="return_to" value={returnTo} />
              <button type="submit" className={dangerButtonClassName}>
                {t("remove")}
              </button>
            </form>
          ) : null}
          <form action={uploadPlayerIdPdf} encType="multipart/form-data" className="flex max-w-xl flex-col gap-3">
            <input type="hidden" name="player_id" value={playerId} />
            <input type="hidden" name="return_to" value={returnTo} />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t("choosePdf")}
              <input
                name="id_pdf"
                type="file"
                accept="application/pdf,.pdf"
                required
                className={inputClassName}
              />
              <span className="font-normal text-zinc-600 dark:text-zinc-400">{t("pdfHint")}</span>
            </label>
            <button type="submit" className={secondaryButtonClassName}>
              {t("uploadPdf")}
            </button>
          </form>
          {hasPdf ? (
            <form action={removePlayerIdPdf}>
              <input type="hidden" name="player_id" value={playerId} />
              <input type="hidden" name="return_to" value={returnTo} />
              <button type="submit" className={dangerButtonClassName}>
                {t("removePdf")}
              </button>
            </form>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("noPdf")}</p>
          )}
        </>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("viewOnly")}</p>
      )}
    </section>
  );
}
