type PageListSkeletonProps = {
  wide?: boolean;
};

export function PageListSkeleton({ wide = false }: PageListSkeletonProps) {
  return (
    <main
      className={`mx-auto flex w-full flex-1 flex-col gap-8 px-6 py-12 ${
        wide ? "max-w-6xl" : "max-w-3xl"
      }`}
      aria-busy="true"
    >
      <p className="sr-only" role="status">
        Loading
      </p>
      <div className="flex flex-col gap-3">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 max-w-xl animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-2/3 max-w-lg animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="flex gap-2">
        <div className="h-10 w-20 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-10 w-20 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="grid gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
          />
        ))}
      </div>
    </main>
  );
}
