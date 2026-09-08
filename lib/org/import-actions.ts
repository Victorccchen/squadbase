"use server";

import { revalidatePath } from "next/cache";
import { formatIsoDate, todayInClubTimeZone } from "@/lib/age-band";
import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { type OrgErrorKey } from "@/lib/org/errors";
import { parseImportBuffer } from "@/lib/org/import-file";
import {
  buildImportPreview,
  headersAreValid,
  resolvedCoachProfile,
  resolvedMatchTeam,
  resolvedPlayerIds,
  type ImportCatalog,
  type ImportPreview,
  type ImportPreviewRow,
} from "@/lib/org/import-validate";
import { isImportKind, type ImportKind } from "@/lib/org/import-templates";
import {
  type CoachImportDraft,
  type MatchImportDraft,
  type PlayerImportDraft,
} from "@/lib/org/import-parse";
import { insertPlayerWithAssignments } from "@/lib/org/player-write";
import { matchRpcErrorKey } from "@/lib/org/match";
import { extractMatchFieldsFromHtml, type MatchUrlSuggestions } from "@/lib/org/url-extract";
import { fetchPublicHtml } from "@/lib/org/url-ssrf";

export type ImportPreviewState = {
  ok: boolean;
  errorKey: OrgErrorKey | null;
  preview: ImportPreview | null;
  attempted: boolean;
};

export const INITIAL_IMPORT_PREVIEW_STATE: ImportPreviewState = {
  ok: false,
  errorKey: null,
  preview: null,
  attempted: false,
};

export type ImportConfirmRow = {
  line: number;
  ok: boolean;
  errorKeys: OrgErrorKey[];
  createdId: string | null;
};

export type ImportConfirmState = {
  ok: boolean;
  errorKey: OrgErrorKey | null;
  created: ImportConfirmRow[];
  failed: ImportConfirmRow[];
  attempted: boolean;
};

export const INITIAL_IMPORT_CONFIRM_STATE: ImportConfirmState = {
  ok: false,
  errorKey: null,
  created: [],
  failed: [],
  attempted: false,
};

export type UrlAssistState = {
  ok: boolean;
  errorKey: OrgErrorKey | null;
  sourceUrl: string | null;
  suggestions: MatchUrlSuggestions | null;
  attempted: boolean;
};

export const INITIAL_URL_ASSIST_STATE: UrlAssistState = {
  ok: false,
  errorKey: null,
  sourceUrl: null,
  suggestions: null,
  attempted: false,
};

type AdminClient = Awaited<ReturnType<typeof createClient>>;
type AdminActorResult =
  | { ok: true; userId: string; supabase: AdminClient }
  | { ok: false; errorKey: "notConfigured" | "forbidden" };

async function requireAdminActor(): Promise<AdminActorResult> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return { ok: false, errorKey: "notConfigured" };
  }
  const { user, roles } = await loadSignedInAccount();
  if (!user || !canAccessAdmin(roles)) {
    return { ok: false, errorKey: "forbidden" };
  }
  const supabase = await createClient();
  return { ok: true, userId: user.id, supabase };
}

async function loadImportCatalog(supabase: AdminClient): Promise<ImportCatalog> {
  const [teams, players, jerseyHolders, profiles, coaches] = await Promise.all([
    supabase.from("teams").select("id, name, kind, age_band, layer_key, eligible_birth_ages, status"),
    supabase.from("players").select("id, name_en_given, name_en_family, birth_date"),
    supabase.from("team_memberships").select("player_id, team_id, jersey_number"),
    supabase.from("profiles").select("id, phone"),
    supabase.from("coaches").select("id, profile_id"),
  ]);
  return {
    teams: teams.data ?? [],
    players: players.data ?? [],
    jerseyHolders: jerseyHolders.data ?? [],
    profiles: profiles.data ?? [],
    coaches: coaches.data ?? [],
  };
}

function readKind(formData: FormData): ImportKind | null {
  const raw = formData.get("kind");
  return typeof raw === "string" && isImportKind(raw) ? raw : null;
}

export async function previewOrgImport(
  _prev: ImportPreviewState,
  formData: FormData,
): Promise<ImportPreviewState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return { ok: false, errorKey: actor.errorKey, preview: null, attempted: true };
  }
  const kind = readKind(formData);
  if (!kind) {
    return { ok: false, errorKey: "importHeaderInvalid", preview: null, attempted: true };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, errorKey: "importEmpty", preview: null, attempted: true };
  }
  const buffer = new Uint8Array(await file.arrayBuffer());
  const parsed = parseImportBuffer(buffer);
  if (!parsed.ok) {
    return { ok: false, errorKey: parsed.errorKey, preview: null, attempted: true };
  }
  if (!headersAreValid(kind, parsed.headers)) {
    return { ok: false, errorKey: "importHeaderInvalid", preview: null, attempted: true };
  }
  const catalog = await loadImportCatalog(actor.supabase);
  const today = formatIsoDate(todayInClubTimeZone());
  const preview = buildImportPreview(kind, parsed.records, catalog, today);
  if (!preview.ok) {
    return { ok: false, errorKey: preview.errorKey, preview: null, attempted: true };
  }
  return {
    ok: true,
    errorKey: null,
    preview,
    attempted: true,
  };
}

function parsePreviewPayload(formData: FormData): ImportPreview | null {
  const raw = formData.get("preview_json");
  if (typeof raw !== "string" || !raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ImportPreview;
    if (!parsed || !isImportKind(parsed.kind) || !Array.isArray(parsed.rows)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function confirmPlayerRow(
  actor: Extract<AdminActorResult, { ok: true }>,
  row: ImportPreviewRow,
  catalog: ImportCatalog,
): Promise<ImportConfirmRow> {
  const draft = row.draft as PlayerImportDraft | null;
  if (!draft) {
    return { line: row.line, ok: false, errorKeys: ["generic"], createdId: null };
  }
  const resolved = resolvedPlayerIds(draft, catalog);
  if (!resolved.squad.ok) {
    return { line: row.line, ok: false, errorKeys: [resolved.squad.errorKey], createdId: null };
  }
  const memberships: { teamId: string; jersey: number }[] = [];
  for (const slot of resolved.competition) {
    if (!slot.team.ok) {
      return { line: row.line, ok: false, errorKeys: [slot.team.errorKey], createdId: null };
    }
    memberships.push({ teamId: slot.team.team.id, jersey: slot.jersey });
  }
  const created = await insertPlayerWithAssignments(
    actor.supabase,
    actor.userId,
    {
      nameZh: draft.nameZh,
      nameEnGiven: draft.nameEnGiven,
      nameEnFamily: draft.nameEnFamily,
      nameJa: draft.nameJa,
      birthDate: draft.birthDate,
      status: "active",
      continuesTraining: draft.continuesTraining,
    },
    { teamId: resolved.squad.team.id, jersey: draft.ageSquadJersey },
    memberships,
  );
  if (!created.ok) {
    return { line: row.line, ok: false, errorKeys: [created.errorKey], createdId: null };
  }
  catalog.players.push({
    id: created.id,
    name_en_given: draft.nameEnGiven,
    name_en_family: draft.nameEnFamily,
    birth_date: draft.birthDate,
  });
  catalog.jerseyHolders.push({
    player_id: created.id,
    team_id: resolved.squad.team.id,
    jersey_number: draft.ageSquadJersey,
  });
  for (const slot of memberships) {
    catalog.jerseyHolders.push({
      player_id: created.id,
      team_id: slot.teamId,
      jersey_number: slot.jersey,
    });
  }
  return { line: row.line, ok: true, errorKeys: [], createdId: created.id };
}

async function confirmCoachRow(
  actor: Extract<AdminActorResult, { ok: true }>,
  row: ImportPreviewRow,
  catalog: ImportCatalog,
): Promise<ImportConfirmRow> {
  const draft = row.draft as CoachImportDraft | null;
  if (!draft) {
    return { line: row.line, ok: false, errorKeys: ["generic"], createdId: null };
  }
  const profile = resolvedCoachProfile(draft, catalog);
  if (!profile.ok) {
    return { line: row.line, ok: false, errorKeys: [profile.errorKey], createdId: null };
  }
  if (catalog.coaches.some((coach) => coach.profile_id === profile.profileId)) {
    return { line: row.line, ok: false, errorKeys: ["coachAlreadyLinked"], createdId: null };
  }
  const { data, error } = await actor.supabase.rpc("admin_link_coach", {
    target_profile_id: profile.profileId,
  });
  if (error || !data) {
    console.error("confirmCoachRow", error?.message);
    return { line: row.line, ok: false, errorKeys: ["generic"], createdId: null };
  }
  catalog.coaches.push({ id: data, profile_id: profile.profileId });
  for (const ref of draft.teamRefs) {
    const team = catalog.teams.find(
      (rowTeam) =>
        rowTeam.id === ref || rowTeam.name.trim().toLowerCase() === ref.trim().toLowerCase(),
    );
    if (!team) {
      return { line: row.line, ok: false, errorKeys: ["teamNotFound"], createdId: data };
    }
    const { error: assignError } = await actor.supabase.from("coach_team_assignments").insert({
      coach_id: data,
      team_id: team.id,
      created_by: actor.userId,
      updated_by: actor.userId,
    });
    if (assignError && assignError.code !== "23505") {
      console.error("confirmCoachRow assign", assignError.message);
      return { line: row.line, ok: false, errorKeys: ["generic"], createdId: data };
    }
  }
  return { line: row.line, ok: true, errorKeys: [], createdId: data };
}

async function confirmMatchRow(
  actor: Extract<AdminActorResult, { ok: true }>,
  row: ImportPreviewRow,
  catalog: ImportCatalog,
): Promise<ImportConfirmRow> {
  const draft = row.draft as MatchImportDraft | null;
  if (!draft) {
    return { line: row.line, ok: false, errorKeys: ["generic"], createdId: null };
  }
  const team = resolvedMatchTeam(draft, catalog);
  if (!team.ok) {
    return { line: row.line, ok: false, errorKeys: [team.errorKey], createdId: null };
  }
  const { data, error } = await actor.supabase.rpc("admin_create_match", {
    p_team_id: team.team.id,
    p_title: draft.title,
    p_kind: draft.kind,
    p_starts_at: draft.startsAt,
    p_ends_at: draft.endsAt,
    p_location: draft.location,
    p_notes: draft.notes,
    p_opponent: draft.opponent,
    p_side: draft.side,
    p_is_playoff: draft.isPlayoff,
    p_is_published: draft.isPublished,
  });
  if (error || !data) {
    console.error("confirmMatchRow", error?.message);
    return { line: row.line, ok: false, errorKeys: [matchRpcErrorKey(error)], createdId: null };
  }
  return { line: row.line, ok: true, errorKeys: [], createdId: data };
}

export async function confirmOrgImport(
  _prev: ImportConfirmState,
  formData: FormData,
): Promise<ImportConfirmState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return { ...INITIAL_IMPORT_CONFIRM_STATE, errorKey: actor.errorKey, attempted: true };
  }
  const preview = parsePreviewPayload(formData);
  if (!preview) {
    return { ...INITIAL_IMPORT_CONFIRM_STATE, errorKey: "importEmpty", attempted: true };
  }
  const validRows = preview.rows.filter((row) => row.valid && row.draft);
  if (validRows.length === 0) {
    return { ...INITIAL_IMPORT_CONFIRM_STATE, errorKey: "importNoValidRows", attempted: true };
  }

  const catalog = await loadImportCatalog(actor.supabase);
  const created: ImportConfirmRow[] = [];
  const failed: ImportConfirmRow[] = [];

  for (const row of validRows) {
    let result: ImportConfirmRow;
    if (preview.kind === "players") {
      result = await confirmPlayerRow(actor, row, catalog);
    } else if (preview.kind === "coaches") {
      result = await confirmCoachRow(actor, row, catalog);
    } else {
      result = await confirmMatchRow(actor, row, catalog);
    }
    if (result.ok) {
      created.push(result);
    } else {
      failed.push(result);
    }
  }

  if (created.length > 0) {
    revalidatePath("/", "layout");
  }

  return {
    ok: failed.length === 0,
    errorKey: failed.length > 0 && created.length > 0 ? "partialTeamCreates" : failed[0]?.errorKeys[0] ?? null,
    created,
    failed,
    attempted: true,
  };
}

export async function assistMatchUrl(
  _prev: UrlAssistState,
  formData: FormData,
): Promise<UrlAssistState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return { ...INITIAL_URL_ASSIST_STATE, errorKey: actor.errorKey, attempted: true };
  }
  const raw = formData.get("url");
  const url = typeof raw === "string" ? raw.trim() : "";
  if (!url) {
    return { ...INITIAL_URL_ASSIST_STATE, errorKey: "blockedUrl", attempted: true };
  }
  const fetched = await fetchPublicHtml(url);
  if (!fetched.ok) {
    return { ...INITIAL_URL_ASSIST_STATE, errorKey: fetched.errorKey, attempted: true };
  }
  const suggestions = extractMatchFieldsFromHtml(fetched.html);
  return {
    ok: true,
    errorKey: null,
    sourceUrl: fetched.url,
    suggestions,
    attempted: true,
  };
}
