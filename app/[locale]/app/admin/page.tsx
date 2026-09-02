import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/page-header";

export default async function AdminHomePage() {
  const t = await getTranslations("admin");
  const common = await getTranslations("common");

  const cards = [
    { href: "/app/admin/teams" as const, title: t("teamsTitle"), body: t("teamsBody") },
    { href: "/app/admin/players" as const, title: t("playersTitle"), body: t("playersBody") },
    { href: "/app/admin/coaches" as const, title: t("coachesTitle"), body: t("coachesBody") },
  ];

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
        <PageHeader title={t("title")} description={t("lead")} />
        <div className="grid gap-4 sm:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <h2 className="text-base font-semibold">{card.title}</h2>
              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{card.body}</p>
            </Link>
          ))}
        </div>
      </main>
      <footer className="border-t border-zinc-200 px-6 py-4 pb-10 text-sm text-zinc-500 dark:border-zinc-800">
        {common("footer")}
      </footer>
    </>
  );
}
