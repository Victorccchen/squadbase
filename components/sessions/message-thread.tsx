import { getTranslations } from "next-intl/server";
import type { SessionRegistrationMessage } from "@/lib/supabase/database.types";
import { formatClubDateTime } from "@/lib/org/session-time";

type MessageThreadProps = {
  messages: SessionRegistrationMessage[];
  locale: string;
};

export async function MessageThread({ messages, locale }: MessageThreadProps) {
  const t = await getTranslations("sessions");

  if (messages.length === 0) {
    return <p className="text-sm text-zinc-500">{t("noMessages")}</p>;
  }

  return (
    <ul className="grid gap-2">
      {messages.map((message) => (
        <li
          key={message.id}
          className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-wide text-zinc-500">
            <span>
              {message.author_role === "admin" ? t("authorAdmin") : t("authorParent")}
            </span>
            <span>{formatClubDateTime(message.created_at, locale)}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap leading-6">{message.body}</p>
        </li>
      ))}
    </ul>
  );
}