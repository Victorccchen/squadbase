/**
 * Staging-only Torneopal FUTURO roster seed.
 *
 * Reads a zh-name + jersey CSV, plans create/update/skip/error, optionally
 * writes through the Supabase service role. Never prints secrets.
 *
 * Default is dry-run. Pass --apply to write.
 *
 *   npm run seed:torneopal-roster -- --csv data/staging/torneopal-futuro-players.csv
 *   npm run seed:torneopal-roster -- --csv path/to/file.csv --apply
 *
 * Env (from the environment or .env.local, never committed):
 *   NEXT_PUBLIC_SUPABASE_URL          staging project URL
 *   SUPABASE_SERVICE_ROLE_KEY         Dashboard → API Keys → service_role
 *
 * Refuses to run unless the URL is the documented staging project.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types.ts";
import { applyTorneopalRosterPlan, formatApplyReport } from "../lib/org/torneopal-roster-apply.ts";
import {
  TORNEOPAL_FUTURO_COMPETITION_TEAMS,
} from "../lib/org/squad-team.ts";
import {
  emitAdminPlayerImportCsv,
  formatRosterSeedReport,
  parseTorneopalRosterCsv,
  type PlannedPlayer,
  type TorneopalSeedCatalog,
} from "../lib/org/torneopal-roster-seed.ts";

const STAGING_PROJECT_REF = "ffksqfgscuezjwdbktcd";
const DEFAULT_CSV = "data/staging/torneopal-futuro-players.csv";

type SeedClient = SupabaseClient<Database>;

function loadEnvFile(path: string): void {
  if (!existsSync(path)) {
    return;
  }
  const text = readFileSync(path, "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function assertStagingUrl(url: string): void {
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV?.trim();
  if (appEnv === "production") {
    fail("Refusing to seed: NEXT_PUBLIC_APP_ENV=production");
  }
  if (!url.includes(STAGING_PROJECT_REF)) {
    fail(
      `Refusing to seed: URL is not the staging project ${STAGING_PROJECT_REF}. supabase.co ref must match README staging.`,
    );
  }
}

async function loadCatalog(supabase: SeedClient): Promise<TorneopalSeedCatalog> {
  const [teams, players, memberships] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, kind, age_band, layer_key, eligible_birth_ages, status"),
    supabase
      .from("players")
      .select("id, name_zh, name_en_given, name_en_family, birth_date, status, continues_training"),
    supabase.from("team_memberships").select("id, player_id, team_id, jersey_number, status"),
  ]);
  if (teams.error) {
    fail(`Failed to load teams: ${teams.error.message}`);
  }
  if (players.error) {
    fail(`Failed to load players: ${players.error.message}`);
  }
  if (memberships.error) {
    fail(`Failed to load memberships: ${memberships.error.message}`);
  }
  return {
    teams: teams.data ?? [],
    players: players.data ?? [],
    memberships: memberships.data ?? [],
  };
}

function requiredTeamNames(catalog: TorneopalSeedCatalog): string[] {
  const names = new Set(catalog.teams.filter((team) => team.status === "active").map((team) => team.name));
  const missing: string[] = [];
  for (const team of TORNEOPAL_FUTURO_COMPETITION_TEAMS) {
    if (!names.has(team.name)) {
      missing.push(team.name);
    }
  }
  for (const squad of ["梯隊 U8", "梯隊 U10", "梯隊 U12"]) {
    if (!names.has(squad)) {
      missing.push(squad);
    }
  }
  return missing;
}

function createStore(supabase: SeedClient) {
  return {
    async insertPlayer(player: PlannedPlayer) {
      const { data, error } = await supabase
        .from("players")
        .insert({
          name_zh: player.zhName,
          name_en_given: player.nameEnGiven,
          name_en_family: player.nameEnFamily,
          birth_date: player.birthDate,
          status: "active",
          continues_training: true,
        })
        .select("id")
        .single();
      if (error || !data) {
        return { ok: false as const, detail: error?.message ?? "player insert failed" };
      }
      return { ok: true as const, id: data.id };
    },
    async updatePlayerIdentity(playerId: string, player: PlannedPlayer) {
      const { error } = await supabase
        .from("players")
        .update({
          name_zh: player.zhName,
          name_en_given: player.nameEnGiven,
          name_en_family: player.nameEnFamily,
          birth_date: player.birthDate,
          status: "active",
          continues_training: true,
        })
        .eq("id", playerId);
      if (error) {
        return { ok: false as const, detail: error.message };
      }
      return { ok: true as const };
    },
    async listMemberships(playerId: string) {
      const { data, error } = await supabase
        .from("team_memberships")
        .select("id, player_id, team_id, jersey_number, status")
        .eq("player_id", playerId);
      if (error) {
        throw new Error(error.message);
      }
      return data ?? [];
    },
    async upsertMembership(row: { playerId: string; teamId: string; jersey: number }) {
      const { data: existing, error: readError } = await supabase
        .from("team_memberships")
        .select("id")
        .eq("player_id", row.playerId)
        .eq("team_id", row.teamId)
        .maybeSingle();
      if (readError) {
        return { ok: false as const, detail: readError.message };
      }
      if (existing?.id) {
        const { error } = await supabase
          .from("team_memberships")
          .update({
            jersey_number: row.jersey,
            status: "active",
          })
          .eq("id", existing.id);
        if (error) {
          return { ok: false as const, detail: error.message };
        }
        return { ok: true as const };
      }
      const { error } = await supabase.from("team_memberships").insert({
        player_id: row.playerId,
        team_id: row.teamId,
        jersey_number: row.jersey,
        status: "active",
      });
      if (error) {
        return { ok: false as const, detail: error.message };
      }
      return { ok: true as const };
    },
    async deactivateMembership(id: string) {
      const { error } = await supabase
        .from("team_memberships")
        .update({ status: "inactive" })
        .eq("id", id);
      if (error) {
        return { ok: false as const, detail: error.message };
      }
      return { ok: true as const };
    },
    async deletePlayer(id: string) {
      await supabase.from("team_memberships").delete().eq("player_id", id);
      const { error } = await supabase.from("players").delete().eq("id", id);
      if (error) {
        return { ok: false as const, detail: error.message };
      }
      return { ok: true as const };
    },
  };
}

async function main(): Promise<void> {
  loadEnvFile(resolve(".env.local"));
  loadEnvFile(resolve(".env"));

  const csvPath = resolve(argValue("--csv") ?? DEFAULT_CSV);
  const emitPath = argValue("--emit-admin-csv");
  const apply = hasFlag("--apply");

  if (!existsSync(csvPath)) {
    fail(
      `CSV not found: ${csvPath}\nCopy the Torneopal zh roster onto this path (see docs/stage-r1-torneopal-roster-seed.md). Example: data/staging/torneopal-futuro-players.example.csv`,
    );
  }

  const csvText = readFileSync(csvPath, "utf8");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

  if (!url) {
    fail("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL). Set it in the environment or .env.local.");
  }
  assertStagingUrl(url);

  if (!serviceKey) {
    fail("Missing SUPABASE_SERVICE_ROLE_KEY. Set it in the environment or .env.local; do not commit it.");
  }

  const supabase = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const catalog = await loadCatalog(supabase);
  const missing = requiredTeamNames(catalog);
  if (missing.length > 0) {
    fail(
      `Staging is missing required units: ${missing.join(", ")}. Paste supabase/migrations/20260918010000_stage_r1_futuro_competition_teams.sql on staging first.`,
    );
  }

  const plan = parseTorneopalRosterCsv(csvText, catalog);
  process.stdout.write(formatRosterSeedReport(plan));

  if (emitPath) {
    writeFileSync(resolve(emitPath), emitAdminPlayerImportCsv(plan.actions));
    console.log(`Wrote Stage 6A create-only CSV to ${resolve(emitPath)} (does not upsert).`);
  }

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to write staging.");
    if (plan.errors > 0) {
      process.exit(2);
    }
    return;
  }

  const applied = await applyTorneopalRosterPlan(plan, createStore(supabase));
  process.stdout.write(formatApplyReport(applied));
  if (applied.errors.length > 0) {
    process.exit(2);
  }
}

await main();
