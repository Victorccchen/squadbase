import { getTranslations } from "next-intl/server";
import { SESSION_KINDS } from "@/lib/org/session-recurrence";
import type { SessionKind } from "@/lib/supabase/database.types";
import { SESSION_KIND_DOT_CLASS } from "@/lib/org/session-kind-colors";

export async function SessionKindLegend({
  kinds = SESSION_KINDS,
}: {
  kinds?: readonly SessionKind[];
}) {
  const t = await getTranslations("sessions");
  const admin = await getTranslations("admin");

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {admin("calendarLegend")}
      </p>
      <ul className="flex flex-wrap gap-3 text-sm">
        {kinds.map((kind) => (
          <li key={kind} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${SESSION_KIND_DOT_CLASS[kind]}`}
              aria-hidden
            />
            {t(`kinds.${kind}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
