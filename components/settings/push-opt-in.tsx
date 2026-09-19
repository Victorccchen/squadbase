"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { disableOwnPushSubscriptions, saveOwnPushSubscription } from "@/lib/push/actions";
import { pushManagerSupported, vapidPublicKeyToUint8Array } from "@/lib/push/vapid-browser";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import { primaryButtonClassName, secondaryButtonClassName } from "@/lib/ui";

type PushOptInProps = {
  initiallyEnabled: boolean;
  vapidPublicKey: string;
};

export function PushOptIn({ initiallyEnabled, vapidPublicKey }: PushOptInProps) {
  const t = useTranslations("settings");
  const org = useTranslations("org");
  const supported = useSyncExternalStore(
    () => () => undefined,
    pushManagerSupported,
    () => false,
  );
  const snapshotPermission = useSyncExternalStore(
    () => () => undefined,
    () => (typeof Notification !== "undefined" ? Notification.permission : "default"),
    () => "default" as NotificationPermission,
  );
  const [permissionOverride, setPermissionOverride] = useState<NotificationPermission | null>(
    null,
  );
  const permission = permissionOverride ?? snapshotPermission;
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(initiallyEnabled);

  const configured = vapidPublicKey.length > 0;

  async function enablePush() {
    setLocalError(null);
    if (!pushManagerSupported()) {
      setLocalError("pushUnsupported");
      return;
    }
    if (!configured) {
      setLocalError("pushNotConfigured");
      return;
    }
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const permissionResult = await Notification.requestPermission();
      setPermissionOverride(permissionResult);
      if (permissionResult !== "granted") {
        setLocalError("pushPermissionDenied");
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKeyToUint8Array(vapidPublicKey),
      });
      const json = subscription.toJSON();
      const endpoint = json.endpoint ?? "";
      const p256dh = json.keys?.p256dh ?? "";
      const auth = json.keys?.auth ?? "";
      if (!endpoint || !p256dh || !auth) {
        setLocalError("pushSubscribeFailed");
        return;
      }
      const form = new FormData();
      form.set("endpoint", endpoint);
      form.set("p256dh", p256dh);
      form.set("auth", auth);
      form.set("user_agent", navigator.userAgent.slice(0, 500));
      const result = await saveOwnPushSubscription(INITIAL_ORG_ACTION_STATE, form);
      if (!result.ok) {
        setLocalError(result.errorKey ?? "pushSubscribeFailed");
        return;
      }
      setEnabled(true);
    } catch {
      setLocalError("pushSubscribeFailed");
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    setLocalError(null);
    setBusy(true);
    try {
      if (pushManagerSupported()) {
        const registration = await navigator.serviceWorker.ready.catch(() => null);
        const current = await registration?.pushManager.getSubscription();
        await current?.unsubscribe();
      }
      const result = await disableOwnPushSubscriptions(INITIAL_ORG_ACTION_STATE);
      if (!result.ok) {
        setLocalError(result.errorKey ?? "generic");
        return;
      }
      setEnabled(false);
    } catch {
      setLocalError("generic");
    } finally {
      setBusy(false);
    }
  }

  const shownError = localError;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {t("pushTitle")}
        </h2>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("pushLead")}</p>
      </div>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("iosHint")}</p>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("stagingHint")}</p>
      {!supported ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">{t("unsupported")}</p>
      ) : null}
      {!configured ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">{org("errors.pushNotConfigured")}</p>
      ) : null}
      <p className="text-sm font-medium">
        {enabled ? t("statusOn") : t("statusOff")}
        {permission === "denied" ? ` · ${t("permissionDenied")}` : null}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButtonClassName}
          disabled={busy || !supported || !configured || enabled}
          onClick={() => void enablePush()}
        >
          {busy ? t("working") : t("enable")}
        </button>
        <button
          type="button"
          className={secondaryButtonClassName}
          disabled={busy || !enabled}
          onClick={() => void disablePush()}
        >
          {t("disable")}
        </button>
      </div>
      {shownError ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {org(`errors.${shownError}`)}
        </p>
      ) : null}
    </section>
  );
}
