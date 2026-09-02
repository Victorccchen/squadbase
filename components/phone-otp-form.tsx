"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { requestPhoneOtp, verifyPhoneOtp } from "@/lib/auth/actions";
import { DIAL_CODES, DEFAULT_DIAL_CODE, toE164 } from "@/lib/auth/phone";
import { safeAppNext } from "@/lib/auth/paths";
import type { AuthErrorKey } from "@/lib/auth/errors";

type PhoneOtpFormProps = {
  nextPath: string;
  supabaseConfigured: boolean;
};

export function PhoneOtpForm({
  nextPath,
  supabaseConfigured,
}: PhoneOtpFormProps) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [dial, setDial] = useState(DEFAULT_DIAL_CODE);
  const [national, setNational] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(
    supabaseConfigured ? null : "notConfigured",
  );
  const [infoKey, setInfoKey] = useState<"codeSent" | "smsBlocked" | null>(null);
  const [pending, startTransition] = useTransition();

  const e164 = useMemo(() => toE164(dial, national), [dial, national]);

  function errorMessage(key: AuthErrorKey | null) {
    if (!key) return null;
    return t(`errors.${key}`);
  }

  function handleSend() {
    setErrorKey(null);
    setInfoKey(null);

    if (!e164) {
      setErrorKey("invalidPhone");
      return;
    }

    startTransition(async () => {
      const result = await requestPhoneOtp(e164);
      if (result.ok) {
        setStep("code");
        setInfoKey("codeSent");
        return;
      }

      setErrorKey(result.errorKey);
      if (result.errorKey === "smsNotConfigured") {
        setStep("code");
        setInfoKey("smsBlocked");
      }
    });
  }

  function handleVerify() {
    setErrorKey(null);

    if (!e164) {
      setErrorKey("invalidPhone");
      return;
    }

    startTransition(async () => {
      const result = await verifyPhoneOtp(e164, code);
      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }

      router.replace(safeAppNext(nextPath));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {step === "phone" ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            handleSend();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[8.5rem_1fr]">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t("countryLabel")}
              <select
                name="dial"
                value={dial}
                onChange={(event) => setDial(event.target.value)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base font-normal dark:border-zinc-700 dark:bg-zinc-900"
              >
                {DIAL_CODES.map((item) => (
                  <option key={item.dial} value={item.dial}>
                    {item.region} {item.dial}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t("phoneLabel")}
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={t("phonePlaceholder")}
                value={national}
                onChange={(event) => setNational(event.target.value)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base font-normal dark:border-zinc-700 dark:bg-zinc-900"
                required
              />
            </label>
          </div>
          <p className="text-sm text-zinc-500">{t("phoneHint")}</p>
          <button
            type="submit"
            disabled={pending || !supabaseConfigured}
            className="rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-60"
          >
            {pending ? t("sending") : t("sendCode")}
          </button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            handleVerify();
          }}
        >
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {t("codeSentTo", { phone: e164 ?? "" })}
          </p>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("codeLabel")}
            <input
              name="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={8}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-center text-2xl tracking-[0.4em] dark:border-zinc-700 dark:bg-zinc-900"
              required
            />
          </label>
          <button
            type="submit"
            disabled={pending || code.length < 4}
            className="rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-60"
          >
            {pending ? t("verifying") : t("verify")}
          </button>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => {
                setStep("phone");
                setCode("");
                setErrorKey(null);
                setInfoKey(null);
              }}
            >
              {t("back")}
            </button>
            <button
              type="button"
              className="underline underline-offset-2 disabled:opacity-50"
              disabled={pending}
              onClick={handleSend}
            >
              {t("resend")}
            </button>
          </div>
        </form>
      )}

      {infoKey === "codeSent" ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          {t("codeSent")}
        </p>
      ) : null}

      {infoKey === "smsBlocked" ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          {t("smsBlocked")}
        </p>
      ) : null}

      {errorKey && errorKey !== "smsNotConfigured" ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100"
        >
          {errorMessage(errorKey)}
        </p>
      ) : null}

      {errorKey === "smsNotConfigured" && infoKey !== "smsBlocked" ? (
        <p
          role="alert"
          className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"
        >
          {t("smsBlocked")}
        </p>
      ) : null}
    </div>
  );
}
