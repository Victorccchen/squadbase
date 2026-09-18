"use client";

import { useEffect } from "react";
import { secondaryButtonClassName } from "@/lib/ui";

export default function AdminImportError({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  retry?: () => void;
}) {
  const tryAgain = reset ?? retry;

  useEffect(() => {
    console.error("AdminImportError", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">無法載入匯入頁</h1>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        This page couldn’t load. You can retry without leaving Admin.
      </p>
      {error.digest ? (
        <p className="font-mono text-xs text-zinc-500">digest {error.digest}</p>
      ) : null}
      {tryAgain ? (
        <p>
          <button type="button" className={secondaryButtonClassName} onClick={() => tryAgain()}>
            再試一次 / Try again
          </button>
        </p>
      ) : null}
    </main>
  );
}
