"use client";

import { useTranslations } from "next-intl";
import { SESSION_KINDS } from "@/lib/org/session-recurrence";
import { inputClassName, secondaryButtonClassName } from "@/lib/ui";

type SessionListFiltersFormProps = {
  kind: string;
  includeDeleted: boolean;
};

export function SessionListFiltersForm({ kind, includeDeleted }: SessionListFiltersFormProps) {
  const t = useTranslations("admin");
  const sessionsT = useTranslations("sessions");

  return (
    <form className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="flex min-w-40 flex-1 flex-col gap-1.5 text-sm font-medium">
        {sessionsT("kind")}
        <select name="kind" defaultValue={kind} className={inputClassName}>
          <option value="">{t("filterAllKinds")}</option>
          {SESSION_KINDS.map((value) => (
            <option key={value} value={value}>
              {sessionsT(`kinds.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="includeDeleted" value="1" defaultChecked={includeDeleted} />
        {t("includeDeleted")}
      </label>
      <button type="submit" className={secondaryButtonClassName}>
        {t("applyFilters")}
      </button>
    </form>
  );
}
