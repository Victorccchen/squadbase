import { playerHasIdPdf } from "@/lib/org/player-photos";

type PlayerPhotoThumbProps = {
  url: string | null;
  alt: string;
  missingLabel: string;
  hasPdf?: boolean;
  pdfLabel?: string;
  size?: "sm" | "md";
};

export function PlayerPhotoThumb({
  url,
  alt,
  missingLabel,
  hasPdf = false,
  pdfLabel,
  size = "sm",
}: PlayerPhotoThumbProps) {
  const box = size === "md" ? "h-24 w-24" : "h-12 w-12";
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`relative inline-flex ${box} shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800`}
      >
        {url ? (
          // Signed URL from the private bucket; never a public Storage URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={alt} className="h-full w-full object-cover" />
        ) : (
          <span aria-label={missingLabel} className="px-1 text-center leading-tight">
            {missingLabel}
          </span>
        )}
      </span>
      {hasPdf && pdfLabel ? (
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {pdfLabel}
        </span>
      ) : null}
    </span>
  );
}

export function playerPdfFlag(player: { id_pdf_path?: string | null }): boolean {
  return playerHasIdPdf(player);
}
