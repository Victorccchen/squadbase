"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const LINKS = [
  { href: "/app/admin/dashboard", key: "opsDashboard" as const, match: "/app/admin/dashboard", prefetch: true },
  { href: "/app/admin/teams", key: "teams" as const, match: "/app/admin/teams", prefetch: false },
  { href: "/app/admin/players", key: "players" as const, match: "/app/admin/players", prefetch: false },
  { href: "/app/admin/coaches", key: "coaches" as const, match: "/app/admin/coaches", prefetch: false },
  { href: "/app/admin/bindings", key: "bindings" as const, match: "/app/admin/bindings", prefetch: false },
  { href: "/app/admin/sessions", key: "sessions" as const, match: "/app/admin/sessions", prefetch: true },
  { href: "/app/admin/matches", key: "matches" as const, match: "/app/admin/matches", prefetch: true },
  { href: "/app/admin/claims", key: "claims" as const, match: "/app/admin/claims", prefetch: false },
  { href: "/app/admin/credits", key: "creditsAdmin" as const, match: "/app/admin/credits", prefetch: false },
  { href: "/app/admin/import", key: "import" as const, match: "/app/admin/import", prefetch: false },
  { href: "/app/admin/notices", key: "notices" as const, match: "/app/admin/notices", prefetch: false },
  { href: "/app/admin/reports", key: "reports" as const, match: "/app/admin/reports", prefetch: false },
] as const;

export function AdminSubnav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("admin")} className="flex flex-wrap gap-2">
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.match);
        return (
          <Link
            key={link.href}
            href={link.href}
            prefetch={link.prefetch ? true : undefined}
            className={
              active
                ? "rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded-full bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            }
          >
            {t(link.key)}
          </Link>
        );
      })}
    </nav>
  );
}
