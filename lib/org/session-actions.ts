"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { parseAppLocale } from "@/i18n/routing";
import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import {
  parseOptionalBoundedText,
  parseOrgStatus,
  parseRequiredBoundedText,
  parseUuid,
  readAllStrings,
  readString,
  sessionRpcErrorKey,
} from "@/lib/org/parse";
import {
  addMinutesToOffsetIso,
  isEndsAfterStart,
  MAX_SESSION_LOCATION,
  MAX_SESSION_MESSAGE,
  MAX_SESSION_NOTES,
  MAX_SESSION_TITLE,
  parseClubDateTimeLocal,
  parseDurationMinutes,
} from "@/lib/org/session-time";
import {
  generateSessionOccurrences,
  isRecurringSessionKind,
  parseSessionKind,
  parseUntilDate,
  parseWeekCount,
  parseWeekdays,
} from "@/lib/org/session-recurrence";
import { type OrgActionState, type OrgErrorKey } from "@/lib/org/errors";

function fail(errorKey: OrgErrorKey): OrgActionState {
  return { ok: false, errorKey };
}

function ok(): OrgActionState {
  return { ok: true, errorKey: null };
}

function localeFromForm(formData: FormData) {
  return parseAppLocale(readString(formData, "locale"));
}

function revalidateSessions() {
  revalidatePath("/", "layout");
}

type AdminHref =
  | "/app/admin/sessions"
  | `/app/admin/sessions/${string}`;

type ParentHref = "/app/sessions" | `/app/sessions/${string}`;

function redirectAdmin(href: AdminHref, formData: FormData) {
  redirect({ href, locale: localeFromForm(formData) });
}

function redirectParent(href: ParentHref, formData: FormData) {
  redirect({ href, locale: localeFromForm(formData) });
}

type AdminClient = Awaited<ReturnType<typeof createClient>>;
type AuthUser = Awaited<ReturnType<typeof loadSignedInAccount>>["user"];
type AdminActorResult =
  | { ok: true; user: AuthUser; supabase: AdminClient }
  | { ok: false; errorKey: "notConfigured" | "forbidden" };

async function requireAdminActor(): Promise<AdminActorResult> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return { ok: false, errorKey: "notConfigured" };
  }

  const { user, roles } = await loadSignedInAccount();
  if (!canAccessAdmin(roles)) {
    return { ok: false, errorKey: "forbidden" };
  }

  const supabase = await createClient();
  return { ok: true, user, supabase };
}

function parseTimeOfDay(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{2}:\d{2}(?::\d{2})?$/.test(trimmed)) {
    return null;
  }
  return trimmed.length === 5 ? `${trimmed}:00` : trimmed;
}

function parseSessionSchedule(formData: FormData, recurring: boolean):
  | { ok: true; startsAt: string; endsAt: string }
  | { ok: false; errorKey: OrgErrorKey } {
  if (recurring) {
    const seriesDate = parseUntilDate(readString(formData, "series_start_date"));
    const startTime = parseTimeOfDay(readString(formData, "start_time"));
    if (!seriesDate || !startTime) {
      return { ok: false, errorKey: "invalidSessionTime" };
    }
    const startsAt = parseClubDateTimeLocal(`${seriesDate}T${startTime}`);
    if (!startsAt) {
      return { ok: false, errorKey: "invalidSessionTime" };
    }

    const endTimeRaw = readString(formData, "end_time");
    const durationRaw = readString(formData, "duration_minutes");
    let endsAt: string | null = null;
    if (endTimeRaw) {
      const endTime = parseTimeOfDay(endTimeRaw);
      if (!endTime) {
        return { ok: false, errorKey: "invalidSessionTime" };
      }
      endsAt = parseClubDateTimeLocal(`${seriesDate}T${endTime}`);
    } else if (durationRaw) {
      const duration = parseDurationMinutes(durationRaw);
      if (!duration) {
        return { ok: false, errorKey: "invalidDuration" };
      }
      endsAt = addMinutesToOffsetIso(startsAt, duration);
    }

    if (!endsAt) {
      return { ok: false, errorKey: "invalidSessionTime" };
    }
    if (!isEndsAfterStart(startsAt, endsAt)) {
      return { ok: false, errorKey: "endsBeforeStart" };
    }
    return { ok: true, startsAt, endsAt };
  }

  const startsAt = parseClubDateTimeLocal(readString(formData, "starts_at"));
  if (!startsAt) {
    return { ok: false, errorKey: "invalidSessionTime" };
  }

  const endsRaw = readString(formData, "ends_at");
  const durationRaw = readString(formData, "duration_minutes");
  let endsAt = endsRaw ? parseClubDateTimeLocal(endsRaw) : null;

  if (!endsAt && durationRaw) {
    const duration = parseDurationMinutes(durationRaw);
    if (!duration) {
      return { ok: false, errorKey: "invalidDuration" };
    }
    endsAt = addMinutesToOffsetIso(startsAt, duration);
  }

  if (!endsAt) {
    return { ok: false, errorKey: "invalidSessionTime" };
  }
  if (!isEndsAfterStart(startsAt, endsAt)) {
    return { ok: false, errorKey: "endsBeforeStart" };
  }

  return { ok: true, startsAt, endsAt };
}

export async function createSession(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const teamId = parseUuid(readString(formData, "team_id"));
  if (!teamId) {
    return fail("missingTeam");
  }

  const kind = parseSessionKind(readString(formData, "kind"));
  if (!kind) {
    return fail("invalidSessionKind");
  }

  const schedule = parseSessionSchedule(formData, isRecurringSessionKind(kind));
  if (!schedule.ok) {
    return fail(schedule.errorKey);
  }

  const location = parseOptionalBoundedText(readString(formData, "location"), MAX_SESSION_LOCATION);
  const notes = parseOptionalBoundedText(readString(formData, "notes"), MAX_SESSION_NOTES);
  const status = parseOrgStatus(readString(formData, "status")) ?? "active";
  const title = parseRequiredBoundedText(readString(formData, "title"), MAX_SESSION_TITLE);
  if (!title) {
    return fail("missingTitle");
  }

  const untilRaw = readString(formData, "until_date");
  const weekRaw = readString(formData, "week_count");
  let untilDate: string | null = null;
  let weekCount: number | null = null;
  let weekdays: number[] | null = null;

  if (isRecurringSessionKind(kind)) {
    const parsedWeekdays = parseWeekdays(readAllStrings(formData, "weekdays"));
    if (parsedWeekdays === null) {
      return fail("invalidWeekdays");
    }
    if (parsedWeekdays.length === 0) {
      return fail("weekdayRequired");
    }
    weekdays = parsedWeekdays;

    if (untilRaw && weekRaw) {
      return fail("recurrenceMutex");
    }
    if (untilRaw) {
      untilDate = parseUntilDate(untilRaw);
      if (!untilDate) {
        return fail("invalidUntilDate");
      }
    }
    if (weekRaw) {
      weekCount = parseWeekCount(weekRaw);
      if (weekCount === null) {
        return fail("invalidWeekCount");
      }
    }

    const generated = generateSessionOccurrences({
      kind,
      startsAt: schedule.startsAt,
      endsAt: schedule.endsAt,
      untilDate,
      weekCount,
      weekdays,
    });
    if (!generated.ok) {
      return fail(generated.errorKey);
    }
  }

  const { error } = await actor.supabase.rpc("admin_create_session_series", {
    p_team_id: teamId,
    p_title: title,
    p_kind: kind,
    p_starts_at: schedule.startsAt,
    p_ends_at: schedule.endsAt,
    p_location: location,
    p_notes: notes,
    p_status: status,
    p_until_date: untilDate,
    p_week_count: weekCount,
    p_weekdays: weekdays,
  });

  if (error) {
    console.error("createSession", error.message);
    return fail(sessionRpcErrorKey(error));
  }

  revalidateSessions();
  redirectAdmin("/app/admin/sessions", formData);
  return ok();
}

export async function updateSession(
  sessionId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const schedule = parseSessionSchedule(formData, false);
  if (!schedule.ok) {
    return fail(schedule.errorKey);
  }

  const location = parseOptionalBoundedText(readString(formData, "location"), MAX_SESSION_LOCATION);
  const notes = parseOptionalBoundedText(readString(formData, "notes"), MAX_SESSION_NOTES);
  const status = parseOrgStatus(readString(formData, "status"));
  if (!status) {
    return fail("invalidStatus");
  }

  const title = parseRequiredBoundedText(readString(formData, "title"), MAX_SESSION_TITLE);
  if (!title) {
    return fail("missingTitle");
  }

  const existing = await actor.supabase
    .from("training_sessions")
    .select("kind")
    .eq("id", sessionId)
    .maybeSingle();
  if (existing.error) {
    console.error("updateSession kind", existing.error.message);
    return fail("generic");
  }
  if (!existing.data) {
    return fail("sessionNotFound");
  }

  const isPlayoff =
    existing.data.kind === "league" && readString(formData, "is_playoff") === "true";

  const { data, error } = await actor.supabase
    .from("training_sessions")
    .update({
      title,
      starts_at: schedule.startsAt,
      ends_at: schedule.endsAt,
      location,
      notes,
      status,
      is_playoff: isPlayoff,
      updated_by: actor.user.id,
    })
    .eq("id", sessionId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("updateSession", error.message);
    return fail("generic");
  }
  if (!data) {
    return fail("sessionNotFound");
  }

  revalidateSessions();
  redirectAdmin(`/app/admin/sessions/${sessionId}`, formData);
  return ok();
}

export async function setSessionStatus(
  sessionId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const status = parseOrgStatus(readString(formData, "status"));
  if (!status) {
    return fail("invalidStatus");
  }

  const { data, error } = await actor.supabase
    .from("training_sessions")
    .update({
      status,
      updated_by: actor.user.id,
    })
    .eq("id", sessionId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("setSessionStatus", error.message);
    return fail("generic");
  }
  if (!data) {
    return fail("sessionNotFound");
  }

  revalidateSessions();
  if (readString(formData, "next") === "list") {
    redirectAdmin("/app/admin/sessions", formData);
  } else {
    redirectAdmin(`/app/admin/sessions/${sessionId}`, formData);
  }
  return ok();
}

export async function softDeleteSession(
  sessionId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const { error } = await actor.supabase.rpc("admin_soft_delete_session", {
    p_session_id: sessionId,
  });

  if (error) {
    console.error("softDeleteSession", error.message);
    return fail(sessionRpcErrorKey(error));
  }

  revalidateSessions();
  if (readString(formData, "next") === "list") {
    redirectAdmin("/app/admin/sessions", formData);
  } else {
    redirectAdmin(`/app/admin/sessions/${sessionId}`, formData);
  }
  return ok();
}

export async function softDeleteSessionSeries(
  seriesId: string,
  sessionId: string,
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return fail(actor.errorKey);
  }

  const { error } = await actor.supabase.rpc("admin_soft_delete_session_series", {
    p_series_id: seriesId,
  });

  if (error) {
    console.error("softDeleteSessionSeries", error.message);
    return fail(sessionRpcErrorKey(error));
  }

  revalidateSessions();
  if (readString(formData, "next") === "list") {
    redirectAdmin("/app/admin/sessions", formData);
  } else {
    redirectAdmin(`/app/admin/sessions/${sessionId}`, formData);
  }
  return ok();
}

export async function registerForSession(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return fail("notConfigured");
  }

  const { user } = await loadSignedInAccount();
  if (!user) {
    return fail("forbidden");
  }

  const sessionId = parseUuid(readString(formData, "session_id"));
  const playerId = parseUuid(readString(formData, "player_id"));
  const parentNote = parseOptionalBoundedText(readString(formData, "parent_note"), 1000);

  if (!sessionId) {
    return fail("missingSession");
  }
  if (!playerId) {
    return fail("missingPlayer");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_player_for_session", {
    p_session_id: sessionId,
    p_player_id: playerId,
    p_parent_note: parentNote,
  });

  if (error) {
    console.error("registerForSession", error.message);
    return fail(sessionRpcErrorKey(error));
  }

  revalidateSessions();
  if (readString(formData, "return_to") === "list") {
    redirect({
      href: {
        pathname: "/app/sessions",
        query: { registered: "1" },
      },
      locale: localeFromForm(formData),
    });
  } else {
    redirectParent(`/app/sessions/${sessionId}`, formData);
  }
  return ok();
}

export async function cancelSessionRegistration(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return fail("notConfigured");
  }

  const { user } = await loadSignedInAccount();
  if (!user) {
    return fail("forbidden");
  }

  const registrationId = parseUuid(readString(formData, "registration_id"));
  const sessionId = parseUuid(readString(formData, "session_id"));
  if (!registrationId) {
    return fail("generic");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_session_registration", {
    p_registration_id: registrationId,
  });

  if (error) {
    console.error("cancelSessionRegistration", error.message);
    return fail(sessionRpcErrorKey(error));
  }

  revalidateSessions();
  if (readString(formData, "return_to") === "list" || !sessionId) {
    redirectParent("/app/sessions", formData);
  } else {
    redirectParent(`/app/sessions/${sessionId}`, formData);
  }
  return ok();
}

export async function updateSessionRegistrationNote(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return fail("notConfigured");
  }

  const { user } = await loadSignedInAccount();
  if (!user) {
    return fail("forbidden");
  }

  const registrationId = parseUuid(readString(formData, "registration_id"));
  const sessionId = parseUuid(readString(formData, "session_id"));
  const parentNote = parseOptionalBoundedText(readString(formData, "parent_note"), 1000);
  if (!registrationId) {
    return fail("generic");
  }
  if (!sessionId) {
    return fail("missingSession");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_session_registration_parent_note", {
    p_registration_id: registrationId,
    p_parent_note: parentNote,
  });

  if (error) {
    console.error("updateSessionRegistrationNote", error.message);
    return fail(sessionRpcErrorKey(error));
  }

  revalidateSessions();
  redirect({
    href: {
      pathname: `/app/sessions/${sessionId}`,
      query: { note: "1" },
    },
    locale: localeFromForm(formData),
  });
  return ok();
}

export async function switchSessionRegistration(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return fail("notConfigured");
  }

  const { user } = await loadSignedInAccount();
  if (!user) {
    return fail("forbidden");
  }

  const registrationId = parseUuid(readString(formData, "registration_id"));
  const newSessionId = parseUuid(readString(formData, "new_session_id"));
  if (!registrationId) {
    return fail("generic");
  }
  if (!newSessionId) {
    return fail("missingSession");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("switch_session_registration", {
    p_registration_id: registrationId,
    p_new_session_id: newSessionId,
  });

  if (error) {
    console.error("switchSessionRegistration", error.message);
    return fail(sessionRpcErrorKey(error));
  }

  revalidateSessions();
  redirectParent(`/app/sessions/${newSessionId}`, formData);
  return ok();
}

export async function postSessionMessage(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return fail("notConfigured");
  }

  const { user, roles } = await loadSignedInAccount();
  if (!user) {
    return fail("forbidden");
  }

  const registrationId = parseUuid(readString(formData, "registration_id"));
  const sessionId = parseUuid(readString(formData, "session_id"));
  const body = parseRequiredBoundedText(readString(formData, "body"), MAX_SESSION_MESSAGE);
  const requestedRole = readString(formData, "author_role");
  const authorRole = requestedRole === "admin" && canAccessAdmin(roles) ? "admin" : "parent";

  if (!registrationId) {
    return fail("generic");
  }
  if (!body) {
    return fail("messageBodyRequired");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("post_session_registration_message", {
    p_registration_id: registrationId,
    p_body: body,
    p_author_role: authorRole,
  });

  if (error) {
    console.error("postSessionMessage", error.message);
    return fail(sessionRpcErrorKey(error));
  }

  revalidateSessions();
  if (authorRole === "admin" && sessionId) {
    redirectAdmin(`/app/admin/sessions/${sessionId}`, formData);
  } else if (sessionId) {
    redirectParent(`/app/sessions/${sessionId}`, formData);
  } else {
    redirectParent("/app/sessions", formData);
  }
  return ok();
}
