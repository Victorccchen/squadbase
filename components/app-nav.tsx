"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

type AppNavProps = {
  isAdmin: boolean;
  canRoster: boolean;
};

function navClass(active: boolean) {
  return active
    ? "rounded-full bg-foreground px-3 py-1.5 text-sm font-medium text-background"
    : "rounded-full px-3 py-1.5 text-sm font-medium text-foreground/80 hover:bg-black/5 dark:hover:bg-white/10";
}

export function AppNav({ isAdmin, canRoster }: AppNavProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const items = [
    { href: "/app", label: t("dashboard"), show: true, match: (path: string) => path === "/app" },
    {
      href: "/app/children",
      label: t("children"),
      show: true,
      match: (path: string) => path.startsWith("/app/children"),
    },
    {
      href: "/app/sessions",
      label: t("sessions"),
      show: true,
      match: (path: string) => path.startsWith("/app/sessions"),
    },
    {
      href: "/app/credits",
      label: t("credits"),
      show: true,
      match: (path: string) => path.startsWith("/app/credits"),
    },
    {
      href: "/app/roster",
      label: t("roster"),
      show: canRoster,
      match: (path: string) => path.startsWith("/app/roster"),
    },
    {
      href: "/app/admin",
      label: t("admin"),
      show: isAdmin,
      match: (path: string) => path.startsWith("/app/admin"),
    },
  ].filter((item) => item.show);

  return (
    <nav
      aria-label={t("label")}
      className="flex flex-wrap items-center gap-1 border-b border-zinc-200 px-6 py-2 dark:border-zinc-800"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.match(pathname) ? "page" : undefined}
          className={navClass(item.match(pathname))}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
