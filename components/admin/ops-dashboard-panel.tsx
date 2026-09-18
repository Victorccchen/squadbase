import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { primaryButtonClassName, secondaryButtonClassName, inputClassName } from "@/lib/ui";
import type { DashboardSnapshot } from "@/lib/org/dashboard";
import type { Team } from "@/lib/supabase/database.types";

type OpsDashboardPanelProps = {
  snapshot: DashboardSnapshot;
  ageSquads: Pick<Team, "id" | "name">[];
  locale: string;
  loadError: boolean;
};

function intlLocale(locale: string): string {
  return locale === "zh-Hant" ? "zh-TW" : locale === "ja" ? "ja-JP" : "en-US";
}

function formatTwd(amount: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(
    Math.round(amount),
  );
}

function formatRate(rate: number | null, locale: string): string {
  if (rate === null) {
    return "—";
  }
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(rate);
}

function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value);
}

export async function OpsDashboardPanel({
  snapshot,
  ageSquads,
  locale,
  loadError,
}: OpsDashboardPanelProps) {
  const t = await getTranslations("dashboard");
  const org = await getTranslations("org");

  return (
    <div className="flex flex-col gap-10">
      <form
        method="get"
        className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("dateFrom")}
            <input
              className={inputClassName}
              type="date"
              name="from"
              defaultValue={snapshot.filters.dateFrom}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("dateTo")}
            <input
              className={inputClassName}
              type="date"
              name="to"
              defaultValue={snapshot.filters.dateTo}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("ageSquad")}
            <select
              className={inputClassName}
              name="squad"
              defaultValue={snapshot.filters.ageSquadId ?? ""}
            >
              <option value="">{t("allSquads")}</option>
              {ageSquads.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs leading-5 text-zinc-500">{t("dateHint")}</p>
        <p className="text-xs leading-5 text-zinc-500">{t("ageSquadHint")}</p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButtonClassName}>
            {t("applyFilters")}
          </button>
          <Link href="/app/admin/reports" className={secondaryButtonClassName}>
            {t("reportsLink")}
          </Link>
        </div>
        <p className="text-xs leading-5 text-zinc-500">{t("reportsLinkHint")}</p>
        <p className="text-xs leading-5 text-zinc-500">{t("privacyHint")}</p>
      </form>

      {loadError ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
          {org("errors.generic")}
        </p>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {t("economicsTitle")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard
            title={t("approvedRemittance")}
            value={t("twd", { amount: formatTwd(snapshot.approvedRemittanceTwd, locale) })}
            meta={t("claimCount", { count: snapshot.approvedClaimCount })}
            hint={t("approvedRemittanceHint")}
          />
          <StatCard
            title={t("consumedValue")}
            value={t("twd", { amount: formatTwd(snapshot.consumedValueTwd, locale) })}
            meta={t("debitCount", {
              count: snapshot.debitCount,
              credits: formatCount(snapshot.debitCredits, locale),
            })}
            hint={t("consumedValueHint")}
          />
          <StatCard
            title={t("periodRemaining")}
            value={t("twd", { amount: formatTwd(snapshot.periodRemainingTwd, locale) })}
            hint={t("periodRemainingHint")}
          />
          <StatCard
            title={t("outstandingLiability")}
            value={t("twd", { amount: formatTwd(snapshot.outstandingLiabilityTwd, locale) })}
            meta={t("outstandingCredits", {
              credits: formatCount(snapshot.outstandingCredits, locale),
            })}
            hint={t("outstandingLiabilityHint")}
          />
        </div>
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm leading-6 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
          <h3 className="mb-2 font-semibold text-zinc-900 dark:text-zinc-100">
            {t("obligationTitle")}
          </h3>
          <p>{t("obligationBody")}</p>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {t("attendanceTitle")}
        </h2>
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-sm font-medium text-zinc-500">{t("attendanceOverall")}</h3>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            {formatRate(snapshot.attendanceRate, locale)}
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            {snapshot.attendanceMarked === 0
              ? t("attendanceEmpty")
              : t("attendanceRate", {
                  rate: formatRate(snapshot.attendanceRate, locale),
                  present: formatCount(snapshot.attendancePresent, locale),
                  marked: formatCount(snapshot.attendanceMarked, locale),
                })}
          </p>
          <p className="mt-3 text-xs leading-5 text-zinc-500">{t("attendanceHint")}</p>
        </article>

        <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <caption className="border-b border-zinc-200 px-4 py-3 text-left text-sm font-semibold dark:border-zinc-800">
              {t("perSquadTitle")}
            </caption>
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-950">
              <tr>
                <th className="px-4 py-2 font-medium">{t("squad")}</th>
                <th className="px-4 py-2 font-medium">{t("present")}</th>
                <th className="px-4 py-2 font-medium">{t("excused")}</th>
                <th className="px-4 py-2 font-medium">{t("unexcused")}</th>
                <th className="px-4 py-2 font-medium">{t("marked")}</th>
                <th className="px-4 py-2 font-medium">{t("rate")}</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.perSquad.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-zinc-500" colSpan={6}>
                    {t("attendanceEmpty")}
                  </td>
                </tr>
              ) : (
                snapshot.perSquad.map((row) => (
                  <tr
                    key={row.squadId ?? "ungrouped"}
                    className="border-t border-zinc-200 dark:border-zinc-800"
                  >
                    <td className="px-4 py-3 font-medium">
                      {row.squadName ?? t("ungrouped")}
                    </td>
                    <td className="px-4 py-3">{formatCount(row.present, locale)}</td>
                    <td className="px-4 py-3">{formatCount(row.excused, locale)}</td>
                    <td className="px-4 py-3">{formatCount(row.unexcused, locale)}</td>
                    <td className="px-4 py-3">{formatCount(row.marked, locale)}</td>
                    <td className="px-4 py-3">{formatRate(row.rate, locale)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-sm font-semibold">{t("monthlyTitle")}</h3>
          {snapshot.monthly.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">{t("attendanceEmpty")}</p>
          ) : (
            <ul className="mt-4 flex items-end gap-3">
              {snapshot.monthly.map((row) => {
                const height = Math.max(4, Math.round((row.rate ?? 0) * 96));
                return (
                  <li key={row.yearMonth} className="flex min-w-12 flex-1 flex-col items-center gap-2">
                    <span className="text-xs text-zinc-500">{formatRate(row.rate, locale)}</span>
                    <div className="flex h-24 w-full items-end justify-center">
                      <div
                        className="w-8 rounded-t bg-zinc-900 dark:bg-zinc-100"
                        style={{ height }}
                        title={`${row.yearMonth} ${formatRate(row.rate, locale)}`}
                      />
                    </div>
                    <span className="text-xs font-medium">{row.yearMonth}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  title,
  value,
  meta,
  hint,
}: {
  title: string;
  value: string;
  meta?: string;
  hint: string;
}) {
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-medium text-zinc-500">{title}</h3>
      <p className="text-3xl font-semibold tracking-tight">{value}</p>
      {meta ? <p className="text-sm text-zinc-600 dark:text-zinc-300">{meta}</p> : null}
      <p className="text-xs leading-5 text-zinc-500">{hint}</p>
    </article>
  );
}
