"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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
  membershipCount: number;
  activeMembershipCount: number;
  coachAssignmentCount: number;
  setStatusAction: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  variant?: "card" | "inline";
  redirectTo?: "detail" | "list";
  editHref?: `/app/admin/teams/${string}/edit`;
};

export function TeamLifecycleForms({
  teamId,
  teamName,
  status,
  membershipCount,
  activeMembershipCount,
  coachAssignmentCount,
  setStatusAction,
  variant = "card",
  redirectTo = "detail",
  editHref,
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
  const nextField = redirectTo === "list" ? "teams" : "detail";
  const errorKey = statusState.errorKey ?? deleteState.errorKey;
  const inactiveMembershipCount = Math.max(0, membershipCount - activeMembershipCount);
  const deleteBlocked = activeMembershipCount > 0;
  const deleteBlockId = `team-delete-block-${teamId}`;
  const confirmMessage = deleteBlocked
    ? t("deleteTeamBlockedConfirm", { name: teamName, count: activeMembershipCount })
    : t("deleteTeamConfirm", {
        name: teamName,
        inactive: inactiveMembershipCount,
        coaches: coachAssignmentCount,
      });

  const blocker =
    deleteBlocked ? (
      <p
        id={deleteBlockId}
        role="status"
        className={
          variant === "inline"
            ? "max-w-md text-sm leading-5 text-amber-800 dark:text-amber-200"
            : "rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"
        }
      >
        {t("deleteBlockedActive", { count: activeMembershipCount })}{" "}
        <Link href={`/app/admin/teams/${teamId}`} className="font-medium underline underline-offset-2">
          {t("openTeamRoster")}
        </Link>
      </p>
    ) : null;

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {editHref ? (
        <Link href={editHref} className={secondaryButtonClassName}>
          {t("edit")}
        </Link>
      ) : null}
      <form action={statusAction}>
        <LocaleHiddenField />
        <input type="hidden" name="status" value={nextStatus} />
        <input type="hidden" name="next" value={nextField} />
        <button type="submit" disabled={statusPending} className={secondaryButtonClassName}>
          {statusPending
            ? org("saving")
            : status === "active"
              ? variant === "inline"
                ? t("deactivateTeamShort")
                : t("deactivateTeam")
              : variant === "inline"
                ? t("reactivateTeamShort")
                : t("reactivateTeam")}
        </button>
      </form>
      <form
        action={deleteAction}
        onSubmit={(event) => {
          if (deleteBlocked) {
            window.confirm(confirmMessage);
            event.preventDefault();
            return;
          }
          if (!window.confirm(confirmMessage)) {
            event.preventDefault();
          }
        }}
      >
        <LocaleHiddenField />
        <input type="hidden" name="team_id" value={teamId} />
        <button
          type="submit"
          disabled={deletePending}
          className={dangerButtonClassName}
          aria-describedby={deleteBlocked ? deleteBlockId : undefined}
        >
          {deletePending ? org("saving") : t("deleteTeamShort")}
        </button>
      </form>
      {variant === "inline" ? blocker : null}
    </div>
  );

  const alerts = (
    <>
      {variant === "card" ? blocker : null}
      {errorKey ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">
          {org(`errors.${errorKey}`)}
        </p>
      ) : null}
    </>
  );

  if (variant === "inline") {
    return (
      <div className="flex flex-col gap-2">
        {actions}
        {alerts}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        {t("teamLifecycleTitle")}
      </h2>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {t("teamLifecycleBody")}
      </p>
      {actions}
      {alerts}
    </div>
  );
}
