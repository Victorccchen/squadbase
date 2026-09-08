"use client";

import { useActionState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import {
  removePlayerHeadshot,
  removePlayerIdPdf,
  uploadPlayerHeadshot,
  uploadPlayerIdPdf,
} from "@/lib/org/player-photo-actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import { HEADSHOT_MAX_EDGE_PX, playerHasHeadshot, playerHasIdPdf } from "@/lib/org/player-photos";
import { PlayerPhotoThumb } from "@/components/players/player-photo-thumb";
import {
  dangerButtonClassName,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "@/lib/ui";

type PlayerPhotoPanelProps = {
  playerId: string;
  photoPath: string | null;
  idPdfPath: string | null;
  signedUrl: string | null;
  canWrite: boolean;
};

async function maybeResizeImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= HEADSHOT_MAX_EDGE_PX) {
      bitmap.close();
      return file;
    }
    const scale = HEADSHOT_MAX_EDGE_PX / longest;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const outputType = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outputType, 0.85);
    });
    if (!blob) {
      return file;
    }
    const ext = outputType === "image/png" ? ".png" : outputType === "image/webp" ? ".webp" : ".jpg";
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}${ext}`, { type: outputType });
  } catch {
    return file;
  }
}

export function PlayerPhotoPanel({
  playerId,
  photoPath,
  idPdfPath,
  signedUrl,
  canWrite,
}: PlayerPhotoPanelProps) {
  const t = useTranslations("photos");
  const org = useTranslations("org");
  const hasPhoto = playerHasHeadshot({ photo_path: photoPath });
  const hasPdf = playerHasIdPdf({ id_pdf_path: idPdfPath });
  const [uploadState, uploadAction, uploadPending] = useActionState(
    uploadPlayerHeadshot,
    INITIAL_ORG_ACTION_STATE,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removePlayerHeadshot,
    INITIAL_ORG_ACTION_STATE,
  );
  const [pdfState, pdfAction, pdfPending] = useActionState(
    uploadPlayerIdPdf,
    INITIAL_ORG_ACTION_STATE,
  );
  const [removePdfState, removePdfAction, removePdfPending] = useActionState(
    removePlayerIdPdf,
    INITIAL_ORG_ACTION_STATE,
  );

  async function onImageChosen(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const resized = await maybeResizeImage(file);
    if (resized === file) {
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(resized);
    input.files = transfer.files;
  }

  const errorKey =
    uploadState.errorKey ??
    removeState.errorKey ??
    pdfState.errorKey ??
    removePdfState.errorKey;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{t("title")}</h2>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("privacyHint")}</p>
      </div>
      <PlayerPhotoThumb
        url={signedUrl}
        alt={t("previewAlt")}
        missingLabel={t("missing")}
        hasPdf={hasPdf}
        pdfLabel={t("hasPdf")}
        size="md"
      />
      {errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${errorKey}`)}
        </p>
      ) : null}
      {canWrite ? (
        <>
          <form action={uploadAction} className="flex max-w-xl flex-col gap-3">
            <LocaleHiddenField />
            <input type="hidden" name="player_id" value={playerId} />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t("chooseImage")}
              <input
                name="headshot"
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                required
                onChange={onImageChosen}
                className={inputClassName}
              />
              <span className="font-normal text-zinc-500">{t("imageHint")}</span>
            </label>
            <button type="submit" disabled={uploadPending} className={primaryButtonClassName}>
              {uploadPending ? t("uploading") : hasPhoto ? t("replace") : t("upload")}
            </button>
          </form>
          {hasPhoto ? (
            <form action={removeAction}>
              <LocaleHiddenField />
              <input type="hidden" name="player_id" value={playerId} />
              <button type="submit" disabled={removePending} className={dangerButtonClassName}>
                {removePending ? t("removing") : t("remove")}
              </button>
            </form>
          ) : null}
          <form action={pdfAction} className="flex max-w-xl flex-col gap-3">
            <LocaleHiddenField />
            <input type="hidden" name="player_id" value={playerId} />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t("choosePdf")}
              <input
                name="id_pdf"
                type="file"
                accept="application/pdf,.pdf"
                required
                className={inputClassName}
              />
              <span className="font-normal text-zinc-500">{t("pdfHint")}</span>
            </label>
            <button type="submit" disabled={pdfPending} className={secondaryButtonClassName}>
              {pdfPending ? t("uploading") : t("uploadPdf")}
            </button>
          </form>
          {hasPdf ? (
            <form action={removePdfAction}>
              <LocaleHiddenField />
              <input type="hidden" name="player_id" value={playerId} />
              <button type="submit" disabled={removePdfPending} className={dangerButtonClassName}>
                {removePdfPending ? t("removing") : t("removePdf")}
              </button>
            </form>
          ) : (
            <p className="text-sm text-zinc-500">{t("noPdf")}</p>
          )}
        </>
      ) : (
        <p className="text-sm text-zinc-500">{t("viewOnly")}</p>
      )}
    </section>
  );
}
