"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { LocaleHiddenField } from "@/components/admin/locale-hidden-field";
import { deleteTeam } from "@/lib/org/actions";
import { INITIAL_ORG_ACTION_STATE } from "@/lib/org/errors";
import type { OrgActionState } from "@/lib/org/errors";
import type { OrgStatus } from "@/lib/supabase/database.types";
import { dangerButtonClassName, secondaryButtonClassName } from "@/lib/ui";

type TeamLifecycleFormsProps = {
  teamId: string;
  teamName: string;
  status: OrgStatus;
  canDelete: boolean;
  membershipCount: number;
  activeMembershipCount: number;
  coachAssignmentCount: number;
  setStatusAction: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
};

export function TeamLifecycleForms({
  teamId,
  teamName,
  status,
  canDelete,
  membershipCount,
  activeMembershipCount,
  coachAssignmentCount,
  setStatusAction,
}: TeamLifecycleFormsProps) {
  const t = useTranslations("admin");
  const org = useTranslations("org");
  const [statusState, statusAction, statusPending] = useActionState(
    setStatusAction,
    INITIAL_ORG_ACTION_STATE,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteTeam,
    INITIAL_ORG_ACTION_STATE,
  );

  const nextStatus = status === "active" ? "inactive" : "active";

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        {t("teamLifecycleTitle")}
      </h2>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {t("teamLifecycleBody")}
      </p>

      <form action={statusAction} className="flex flex-col gap-2">
        <LocaleHiddenField />
        <input type="hidden" name="status" value={nextStatus} />
        {statusState.errorKey ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
            {org(`errors.${statusState.errorKey}`)}
          </p>
        ) : null}
        <button type="submit" disabled={statusPending} className={secondaryButtonClassName}>
          {statusPending
            ? org("saving")
            : status === "active"
              ? t("deactivateTeam")
              : t("reactivateTeam")}
        </button>
      </form>

      {canDelete ? (
        <form
          action={deleteAction}
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            if (!window.confirm(t("deleteTeamConfirm", { name: teamName }))) {
              event.preventDefault();
            }
          }}
        >
          <LocaleHiddenField />
          <input type="hidden" name="team_id" value={teamId} />
          {deleteState.errorKey ? (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
              {org(`errors.${deleteState.errorKey}`)}
            </p>
          ) : null}
          <button type="submit" disabled={deletePending} className={dangerButtonClassName}>
            {deletePending ? org("saving") : t("deleteTeam")}
          </button>
        </form>
      ) : (
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {activeMembershipCount > 0
            ? t("deleteBlockedActive", { count: activeMembershipCount })
            : membershipCount > 0
              ? t("deleteBlockedMemberships", { count: membershipCount })
              : t("deleteBlockedCoaches", { count: coachAssignmentCount })}
        </p>
      )}
    </div>
  );
}
