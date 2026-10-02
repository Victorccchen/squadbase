"use client";

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white print:hidden dark:bg-zinc-100 dark:text-zinc-900"
    >
      {label}
    </button>
  );
}
