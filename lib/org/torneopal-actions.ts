"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getPublicSupabaseEnv } from "@/lib/env";
import { getAuthUser, loadOwnAccount } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { matchRpcErrorKey } from "@/lib/org/match";
import { isCompetitionTeam } from "@/lib/org/squad-team";
import type { ImportTeam } from "@/lib/org/import-validate";
import { parsePublicScheduleHtml } from "@/lib/org/schedule-extract";
import { fetchScheduleHtml } from "@/lib/org/torneopal-fetch";
import {
  buildTorneopalPreview,
  matchDuplicateKey,
  parseTorneopalPreviewJson,
  serializeTorneopalPreview,
  type ExistingMatchShell,
} from "@/lib/org/torneopal-preview";
import type {
  TorneopalConfirmRow,
  TorneopalConfirmState,
  TorneopalPreviewState,
} from "@/lib/org/torneopal-state";

type AdminClient = Awaited<ReturnType<typeof createClient>>;
type AdminActorResult =
  | { ok: true; userId: string; supabase: AdminClient }
  | { ok: false; errorKey: "notConfigured" | "forbidden" };

async function requireAdminActor(): Promise<AdminActorResult> {
  if (!getPublicSupabaseEnv().isConfigured) {
    return { ok: false, errorKey: "notConfigured" };
  }
  // Do not use loadSignedInAccount()/getLocale(): next-intl reads
  // next/root-params, which throws during the Server Action phase.
  const user = await getAuthUser();
  if (!user) {
    return { ok: false, errorKey: "forbidden" };
  }
  const { roles } = await loadOwnAccount(user.id);
  if (!canAccessAdmin(roles)) {
    return { ok: false, errorKey: "forbidden" };
  }
  const supabase = await createClient();
  return { ok: true, userId: user.id, supabase };
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function loadCompetitionTeams(
  supabase: AdminClient,
): Promise<{ ok: true; teams: ImportTeam[] } | { ok: false }> {
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, kind, age_band, layer_key, eligible_birth_ages, status")
    .eq("kind", "competition_team");
  if (error) {
    console.error("loadCompetitionTeams", error.message);
    return { ok: false };
  }
  return { ok: true, teams: data ?? [] };
}

async function loadExistingMatchShells(
  supabase: AdminClient,
  teamIds: string[],
): Promise<{ ok: true; existing: ExistingMatchShell[] } | { ok: false }> {
  if (teamIds.length === 0) {
    return { ok: true, existing: [] };
  }
  const { data, error } = await supabase
    .from("match_publications")
    .select("opponent, training_sessions!inner(team_id, starts_at, deleted_at)")
    .in("training_sessions.team_id", teamIds)
    .is("training_sessions.deleted_at", null);
  if (error) {
    console.error("loadExistingMatchShells", error.message);
    return { ok: false };
  }
  const existing: ExistingMatchShell[] = [];
  for (const row of data ?? []) {
    const session = one(
      row.training_sessions as
        | { team_id: string; starts_at: string; deleted_at: string | null }
        | { team_id: string; starts_at: string; deleted_at: string | null }[]
        | null,
    );
    if (!session) {
      continue;
    }
    existing.push({
      teamId: session.team_id,
      startsAt: session.starts_at,
      opponent: row.opponent,
    });
  }
  return { ok: true, existing };
}

export async function previewTorneopalSchedule(
  _prev: TorneopalPreviewState,
  formData: FormData,
): Promise<TorneopalPreviewState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return { ok: false, errorKey: actor.errorKey, previewJson: null, attempted: true };
  }
  try {
    const raw = formData.get("url");
    const url = typeof raw === "string" ? raw.trim() : "";
    if (!url) {
      return { ok: false, errorKey: "blockedUrl", previewJson: null, attempted: true };
    }
    const fetched = await fetchScheduleHtml(url);
    if (!fetched.ok) {
      return { ok: false, errorKey: fetched.errorKey, previewJson: null, attempted: true };
    }
    const parsed = parsePublicScheduleHtml(fetched.html);
    if (parsed.loginWall && parsed.fixtures.length === 0) {
      return { ok: false, errorKey: "urlLoginRequired", previewJson: null, attempted: true };
    }
    const teams = await loadCompetitionTeams(actor.supabase);
    if (!teams.ok) {
      return { ok: false, errorKey: "generic", previewJson: null, attempted: true };
    }
    const teamIds = teams.teams.filter((team) => isCompetitionTeam(team)).map((team) => team.id);
    const existing = await loadExistingMatchShells(actor.supabase, teamIds);
    if (!existing.ok) {
      return { ok: false, errorKey: "generic", previewJson: null, attempted: true };
    }
    const preview = buildTorneopalPreview({
      sourceUrl: fetched.url,
      parsed,
      teams: teams.teams,
      existing: existing.existing,
    });
    if (!preview.ok) {
      return { ok: false, errorKey: preview.errorKey, previewJson: null, attempted: true };
    }
    return {
      ok: true,
      errorKey: null,
      previewJson: serializeTorneopalPreview(preview),
      attempted: true,
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("previewTorneopalSchedule", error);
    return { ok: false, errorKey: "generic", previewJson: null, attempted: true };
  }
}

function emptyConfirm(errorKey: TorneopalConfirmState["errorKey"]): TorneopalConfirmState {
  return {
    ok: false,
    errorKey,
    created: [],
    skipped: [],
    failed: [],
    attempted: true,
  };
}

export async function confirmTorneopalSchedule(
  _prev: TorneopalConfirmState,
  formData: FormData,
): Promise<TorneopalConfirmState> {
  const actor = await requireAdminActor();
  if (!actor.ok) {
    return emptyConfirm(actor.errorKey);
  }
  try {
    const raw = formData.get("preview_json");
    const preview = typeof raw === "string" ? parseTorneopalPreviewJson(raw) : null;
    if (!preview) {
      return emptyConfirm("importEmpty");
    }
    const createRows = preview.rows.filter((row) => row.status === "create" && row.draft);
    if (createRows.length === 0) {
      return emptyConfirm("importNoValidRows");
    }

    const teams = await loadCompetitionTeams(actor.supabase);
    if (!teams.ok) {
      return emptyConfirm("generic");
    }
    const teamIds = teams.teams.filter((team) => isCompetitionTeam(team)).map((team) => team.id);
    const existing = await loadExistingMatchShells(actor.supabase, teamIds);
    if (!existing.ok) {
      return emptyConfirm("generic");
    }
    const seen = new Set(
      existing.existing.map((row) =>
        matchDuplicateKey({
          teamId: row.teamId,
          startsAt: row.startsAt,
          opponent: row.opponent,
        }),
      ),
    );

    const created: TorneopalConfirmRow[] = [];
    const skipped: TorneopalConfirmRow[] = [];
    const failed: TorneopalConfirmRow[] = [];

    for (const row of createRows) {
      const draft = row.draft;
      if (!draft || draft.kind !== "league") {
        failed.push({
          line: row.line,
          ok: false,
          skipped: false,
          errorKeys: ["matchKindRequired"],
          createdId: null,
        });
        continue;
      }
      const key = matchDuplicateKey({
        teamId: draft.teamRef,
        startsAt: draft.startsAt,
        opponent: draft.opponent,
      });
      if (seen.has(key)) {
        skipped.push({
          line: row.line,
          ok: true,
          skipped: true,
          errorKeys: ["duplicateMatch"],
          createdId: null,
        });
        continue;
      }
      const { data, error } = await actor.supabase.rpc("admin_create_match", {
        p_team_id: draft.teamRef,
        p_title: draft.title,
        p_kind: "league",
        p_starts_at: draft.startsAt,
        p_ends_at: draft.endsAt,
        p_location: draft.location,
        p_notes: draft.notes,
        p_opponent: draft.opponent,
        p_side: draft.side,
        p_is_playoff: false,
        p_is_published: false,
      });
      if (error || !data) {
        console.error("confirmTorneopalSchedule", error?.message);
        failed.push({
          line: row.line,
          ok: false,
          skipped: false,
          errorKeys: [matchRpcErrorKey(error)],
          createdId: null,
        });
        continue;
      }
      seen.add(key);
      created.push({
        line: row.line,
        ok: true,
        skipped: false,
        errorKeys: [],
        createdId: data,
      });
    }

    if (created.length > 0) {
      revalidatePath("/", "layout");
    }

    return {
      ok: failed.length === 0,
      errorKey:
        failed.length > 0 && created.length > 0
          ? "partialTeamCreates"
          : failed[0]?.errorKeys[0] ?? null,
      created,
      skipped,
      failed,
      attempted: true,
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("confirmTorneopalSchedule", error);
    return emptyConfirm("generic");
  }
}
