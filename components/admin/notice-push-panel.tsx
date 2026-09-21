"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { previewNoticePush, sendNoticePush } from "@/lib/push/actions";
import {
  INITIAL_PUSH_PREVIEW_STATE,
  INITIAL_PUSH_SEND_STATE,
} from "@/lib/org/errors";
import type { NoticeAudienceKey, NoticeLocale, NoticeTemplateKey } from "@/lib/credits/notice-templates";
import { primaryButtonClassName } from "@/lib/ui";

type NoticePushPanelProps = {
  sessionId: string;
  template: NoticeTemplateKey;
  audience: NoticeAudienceKey;
  teamId: string;
  copyLocale: NoticeLocale;
  kit: string;
  gear: string;
  gather: string;
  recap: string;
};

export function NoticePushPanel(props: NoticePushPanelProps) {
  const t = useTranslations("notices");
  const org = useTranslations("org");
  const previewKey = `${props.sessionId}:${props.template}:${props.audience}:${props.teamId}:${props.copyLocale}`;
  const [preview, setPreview] = useState(INITIAL_PUSH_PREVIEW_STATE);
  const [loadedKey, setLoadedKey] = useState("");
  const [sendState, sendAction, sending] = useActionState(
    sendNoticePush,
    INITIAL_PUSH_SEND_STATE,
  );

  useEffect(() => {
    let cancelled = false;
    const form = new FormData();
    form.set("session_id", props.sessionId);
    form.set("template", props.template);
    form.set("audience", props.audience);
    form.set("team_id", props.teamId);
    form.set("copy_locale", props.copyLocale);
    void previewNoticePush(INITIAL_PUSH_PREVIEW_STATE, form).then((next) => {
      if (!cancelled) {
        setPreview(next);
        setLoadedKey(previewKey);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    previewKey,
    props.sessionId,
    props.template,
    props.audience,
    props.teamId,
    props.copyLocale,
  ]);

  const counts = sendState.ok ? sendState : preview;
  const canSend =
    props.audience === "session_registrations" || props.teamId.length > 0;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {t("pushTitle")}
        </h2>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("pushLead")}</p>
      </div>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("pushStagingHint")}</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
          <dt className="text-zinc-500">{t("pushIntended")}</dt>
          <dd className="text-lg font-semibold">{loadedKey === previewKey ? counts.intended : "…"}</dd>
        </div>
        <div className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
          <dt className="text-zinc-500">{t("pushSubscribed")}</dt>
          <dd className="text-lg font-semibold">{loadedKey === previewKey ? counts.subscribed : "…"}</dd>
        </div>
        <div className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
          <dt className="text-zinc-500">{t("pushSkipped")}</dt>
          <dd className="text-lg font-semibold">{loadedKey === previewKey ? counts.skipped : "…"}</dd>
        </div>
      </dl>
      {preview.errorKey ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {org(`errors.${preview.errorKey}`)}
        </p>
      ) : null}
      <form action={sendAction} className="flex flex-col gap-3">
        <input type="hidden" name="session_id" value={props.sessionId} />
        <input type="hidden" name="template" value={props.template} />
        <input type="hidden" name="audience" value={props.audience} />
        <input type="hidden" name="team_id" value={props.teamId} />
        <input type="hidden" name="copy_locale" value={props.copyLocale} />
        <input type="hidden" name="kit" value={props.kit} />
        <input type="hidden" name="gear" value={props.gear} />
        <input type="hidden" name="gather" value={props.gather} />
        <input type="hidden" name="recap" value={props.recap} />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className={primaryButtonClassName}
            disabled={sending || !canSend}
          >
            {sending ? t("pushSending") : t("pushSend")}
          </button>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("pushKeepLine")}</p>
        </div>
      </form>
      {sendState.errorKey ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {org(`errors.${sendState.errorKey}`)}
        </p>
      ) : null}
      {sendState.ok ? (
        <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-200" role="status">
          {t("pushResult", {
            intended: sendState.intended,
            subscribed: sendState.subscribed,
            skipped: sendState.skipped,
            sent: sendState.sent,
            failed: sendState.failed,
          })}
        </p>
      ) : null}
    </section>
  );
}
