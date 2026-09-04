"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { registerForSession } from "@/lib/org/session-actions";
import {
  INITIAL_ORG_ACTION_STATE,
  type OrgActionState,
} from "@/lib/org/errors";
import type { EligibleChild } from "@/lib/org/session-queries";
import { localizedPlayerName } from "@/lib/org/display-name";
import { inputClassName, primaryButtonClassName } from "@/lib/ui";

type RegisterFormProps = {
  sessionId: string;
  childrenOptions: EligibleChild[];
  locale: string;
  returnTo?: "list" | "detail";
};

type RegisterFormFieldsProps = RegisterFormProps & {
  formId?: string;
  hideSubmit?: boolean;
  formAction: (payload: FormData) => void;
  state: OrgActionState;
  pending: boolean;
};

export function RegisterForm(props: RegisterFormProps) {
  const [state, formAction, pending] = useActionState(
    registerForSession,
    INITIAL_ORG_ACTION_STATE,
  );
  return (
    <RegisterFormFields
      {...props}
      formAction={formAction}
      state={state}
      pending={pending}
    />
  );
}

export function RegisterFormFields({
  sessionId,
  childrenOptions,
  locale,
  returnTo = "detail",
  formId,
  hideSubmit = false,
  formAction,
  state,
  pending,
}: RegisterFormFieldsProps) {
  const t = useTranslations("sessions");
  const org = useTranslations("org");

  if (childrenOptions.length === 0) {
    return (
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("noEligibleChild")}</p>
    );
  }

  const onlyChild = childrenOptions.length === 1 ? childrenOptions[0] : null;

  return (
    <form id={formId} action={formAction} className="flex max-w-xl flex-col gap-4">
      <LocaleHiddenField />
      <input type="hidden" name="session_id" value={sessionId} />
      {returnTo === "list" ? <input type="hidden" name="return_to" value="list" /> : null}
      {onlyChild ? (
        <input type="hidden" name="player_id" value={onlyChild.player.id} />
      ) : (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("selectChild")}
          <select name="player_id" required defaultValue="" className={inputClassName}>
            <option value="">{t("selectChild")}</option>
            {childrenOptions.map((child) => (
              <option key={child.linkId} value={child.player.id}>
                {localizedPlayerName(child.player, locale)} · {child.teamName} · #{child.jerseyNumber}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t("parentNote")}
        <textarea
          name="parent_note"
          rows={3}
          maxLength={1000}
          className={inputClassName}
        />
        <span className="font-normal text-zinc-500">{t("parentNoteHint")}</span>
      </label>
      {state.errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${state.errorKey}`)}
        </p>
      ) : null}
      {hideSubmit ? null : (
        <button type="submit" disabled={pending} className={primaryButtonClassName}>
          {pending ? t("registering") : t("register")}
        </button>
      )}
    </form>
  );
}
