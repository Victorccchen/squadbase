/**
 * Stage R admin report queries. Reuses existing RLS SELECT (admin-only in the action).
 * No new SQL: attendance, registrations, ledger, and match_roster are already granted.
 */

import type { AppRole, TeamKind } from "@/lib/supabase/database.types";
import type { AttendanceStatus, CreditLedgerEntryType } from "@/lib/credits/debit-rules";
import type { OrgErrorKey } from "@/lib/org/errors";
import type { PlayerNameFields } from "@/lib/org/display-name";
import {
  REPORT_ROW_CAP,
  filterAttendanceRows,
  filterLedgerRows,
  filterMatchRosterRows,
  filterRegistrationRows,
  kindsForReport,
  reportDateBounds,
  selectedUnitIds,
  sessionPassesFilters,
  type AttendanceSourceRow,
  type LedgerSourceRow,
  type MatchRosterSourceRow,
  type RegistrationSourceRow,
  type ReportFilters,
  type ReportSessionRef,
} from "@/lib/org/reports";
import type { SessionKind } from "@/lib/org/session-recurrence";
import type { MatchPublicStatus, SessionRegistrationStatus } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const PAGE = 1000;
const SOURCE_SCAN_CAP = 25000;

type AdminClient = Awaited<ReturnType<typeof createClient>>;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapPlayer(value: unknown): PlayerNameFields | null {
  const row = one(value as PlayerNameFields | PlayerNameFields[] | null);
  if (!row || !row.name_en_given || !row.name_en_family) {
    return null;
  }
  return {
    name_zh: row.name_zh ?? null,
    name_en_given: row.name_en_given,
    name_en_family: row.name_en_family,
    name_ja: row.name_ja ?? null,
  };
}

function mapSession(value: unknown): ReportSessionRef | null {
  const row = one(
    value as
      | {
          id: string;
          title: string;
          kind: SessionKind;
          starts_at: string;
          team_id: string;
          deleted_at: string | null;
          teams?: { id: string; name: string; kind: TeamKind } | { id: string; name: string; kind: TeamKind }[] | null;
        }
      | {
          id: string;
          title: string;
          kind: SessionKind;
          starts_at: string;
          team_id: string;
          deleted_at: string | null;
          teams?: { id: string; name: string; kind: TeamKind } | { id: string; name: string; kind: TeamKind }[] | null;
        }[]
      | null,
  );
  if (!row) {
    return null;
  }
  const team = one(row.teams ?? null);
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    starts_at: row.starts_at,
    team_id: row.team_id,
    team_name: team?.name ?? null,
    team_kind: team?.kind ?? null,
    deleted_at: row.deleted_at,
  };
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

type QueryResult<T> =
  | { ok: true; rows: T[] }
  | { ok: false; errorKey: OrgErrorKey };

async function fetchPages<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<QueryResult<T>> {
  const rows: T[] = [];
  let from = 0;
  while (from < SOURCE_SCAN_CAP) {
    const page = await fetchPage(from, from + PAGE - 1);
    if (page.error) {
      console.error("report query", page.error.message);
      return { ok: false, errorKey: "generic" };
    }
    const data = page.data ?? [];
    rows.push(...data);
    if (rows.length > SOURCE_SCAN_CAP) {
      return { ok: false, errorKey: "reportTooManyRows" };
    }
    if (data.length < PAGE) {
      break;
    }
    from += PAGE;
  }
  return { ok: true, rows };
}

type SessionJoinQuery = {
  eq: (column: string, value: string) => SessionJoinQuery;
  in: (column: string, values: string[]) => SessionJoinQuery;
  is: (column: string, value: null) => SessionJoinQuery;
  gte: (column: string, value: string) => SessionJoinQuery;
  lt: (column: string, value: string) => SessionJoinQuery;
  range: (
    from: number,
    to: number,
  ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
};

function applyNestedSessionFilters(query: SessionJoinQuery, filters: ReportFilters): SessionJoinQuery {
  let next = query;
  if (filters.sessionId) {
    return next.eq("session_id", filters.sessionId);
  }
  const kinds = kindsForReport(filters);
  if (kinds) {
    if (kinds.length === 0) {
      return next.in("training_sessions.kind", ["__none__"]);
    }
    next = next.in("training_sessions.kind", kinds);
  }
  const units = selectedUnitIds(filters);
  if (units.length > 0) {
    next = next.in("training_sessions.team_id", units);
  }
  if (!filters.includeDeleted) {
    next = next.is("training_sessions.deleted_at", null);
  }
  const bounds = reportDateBounds(filters);
  if (bounds) {
    next = next.gte("training_sessions.starts_at", bounds.from).lt(
      "training_sessions.starts_at",
      bounds.toExclusive,
    );
  }
  return next;
}

async function loadJerseys(
  supabase: AdminClient,
  pairs: readonly { playerId: string; teamId: string }[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const playerIds = [...new Set(pairs.map((pair) => pair.playerId))];
  if (playerIds.length === 0) {
    return map;
  }
  const wanted = new Set(pairs.map((pair) => `${pair.playerId}:${pair.teamId}`));
  for (const ids of chunk(playerIds, 200)) {
    const { data, error } = await supabase
      .from("team_memberships")
      .select("player_id, team_id, jersey_number, status")
      .in("player_id", ids);
    if (error) {
      console.error("report jerseys", error.message);
      continue;
    }
    const inactive = new Map<string, number>();
    for (const row of data ?? []) {
      const key = `${row.player_id}:${row.team_id}`;
      if (!wanted.has(key)) {
        continue;
      }
      if (row.status === "active") {
        map.set(key, row.jersey_number);
      } else if (!map.has(key) && !inactive.has(key)) {
        inactive.set(key, row.jersey_number);
      }
    }
    for (const [key, jersey] of inactive) {
      if (!map.has(key)) {
        map.set(key, jersey);
      }
    }
  }
  return map;
}

async function loadLeaveNotes(
  supabase: AdminClient,
  sessionIds: readonly string[],
): Promise<Map<string, string>> {
  const notes = new Map<string, string>();
  const rank = (status: string) =>
    status === "approved" ? 3 : status === "pending" ? 2 : 1;
  for (const ids of chunk([...new Set(sessionIds)], 200)) {
    if (ids.length === 0) {
      continue;
    }
    const { data, error } = await supabase
      .from("session_leave_requests")
      .select("status, parent_note, session_registrations!inner(session_id, player_id)")
      .in("session_registrations.session_id", ids);
    if (error) {
      console.error("report leave notes", error.message);
      continue;
    }
    const best = new Map<string, { rank: number; note: string }>();
    for (const row of data ?? []) {
      const nested = one(
        row.session_registrations as
          | { session_id: string; player_id: string }
          | { session_id: string; player_id: string }[]
          | null,
      );
      const note = (row.parent_note as string | null)?.trim() ?? "";
      if (!nested || !note) {
        continue;
      }
      const key = `${nested.session_id}:${nested.player_id}`;
      const nextRank = rank(String(row.status));
      const prev = best.get(key);
      if (!prev || nextRank > prev.rank) {
        best.set(key, { rank: nextRank, note });
      }
    }
    for (const [key, value] of best) {
      notes.set(key, value.note);
    }
  }
  return notes;
}

async function loadActorRoles(
  supabase: AdminClient,
  userIds: readonly string[],
): Promise<Map<string, AppRole[]>> {
  const map = new Map<string, AppRole[]>();
  const ids = [...new Set(userIds.filter(Boolean))];
  for (const batch of chunk(ids, 200)) {
    if (batch.length === 0) {
      continue;
    }
    const { data, error } = await supabase.from("user_roles").select("user_id, role").in("user_id", batch);
    if (error) {
      console.error("report actor roles", error.message);
      continue;
    }
    for (const row of data ?? []) {
      const list = map.get(row.user_id) ?? [];
      list.push(row.role as AppRole);
      map.set(row.user_id, list);
    }
  }
  return map;
}

const SESSION_SELECT =
  "id, title, kind, starts_at, team_id, deleted_at, teams (id, name, kind)";
const PLAYER_SELECT = "name_zh, name_en_given, name_en_family, name_ja";

export async function queryAttendanceReport(
  supabase: AdminClient,
  filters: ReportFilters,
): Promise<QueryResult<AttendanceSourceRow>> {
  const kinds = kindsForReport(filters);
  if (kinds && kinds.length === 0) {
    return { ok: true, rows: [] };
  }

  const fetched = await fetchPages((from, to) => {
    const query = applyNestedSessionFilters(
      supabase
        .from("session_attendance")
        .select(
          `status, credits_debited, player_id, session_id, players (${PLAYER_SELECT}), training_sessions!inner (${SESSION_SELECT})`,
        ) as unknown as SessionJoinQuery,
      filters,
    );
    return query.range(from, to);
  });
  if (!fetched.ok) {
    return fetched;
  }

  const mapped: AttendanceSourceRow[] = [];
  for (const raw of fetched.rows) {
    const row = raw as Record<string, unknown>;
    const session = mapSession(row.training_sessions);
    const player = mapPlayer(row.players);
    if (!session || !player) {
      continue;
    }
    mapped.push({
      session,
      playerId: String(row.player_id),
      player,
      jersey: null,
      attendanceStatus: (row.status as AttendanceStatus | null) ?? null,
      creditsDebited: Number(row.credits_debited ?? 0),
      leaveNote: null,
    });
  }
  const filtered = filterAttendanceRows(mapped, filters);
  if (reportCap(filtered.length)) {
    return { ok: false, errorKey: "reportTooManyRows" };
  }
  const jerseys = await loadJerseys(
    supabase,
    filtered.map((row) => ({ playerId: row.playerId, teamId: row.session.team_id })),
  );
  const leave = await loadLeaveNotes(
    supabase,
    filtered.map((row) => row.session.id),
  );
  return {
    ok: true,
    rows: filtered
      .map((row) => ({
        ...row,
        jersey: jerseys.get(`${row.playerId}:${row.session.team_id}`) ?? null,
        leaveNote: leave.get(`${row.session.id}:${row.playerId}`) ?? row.leaveNote,
      }))
      .sort(sortBySessionThenPlayer),
  };
}

function englishKey(player: PlayerNameFields): string {
  return `${player.name_en_given}\0${player.name_en_family}\0${player.name_zh ?? ""}\0${player.name_ja ?? ""}`;
}

function sortBySessionThenPlayer(a: { session: ReportSessionRef; player: PlayerNameFields }, b: {
  session: ReportSessionRef;
  player: PlayerNameFields;
}): number {
  const byStart = a.session.starts_at.localeCompare(b.session.starts_at);
  if (byStart !== 0) {
    return byStart;
  }
  const byTitle = a.session.title.localeCompare(b.session.title);
  if (byTitle !== 0) {
    return byTitle;
  }
  return englishKey(a.player).localeCompare(englishKey(b.player));
}

function reportCap(count: number): boolean {
  return count > REPORT_ROW_CAP;
}

export async function queryRegistrationsReport(
  supabase: AdminClient,
  filters: ReportFilters,
): Promise<QueryResult<RegistrationSourceRow>> {
  const kinds = kindsForReport(filters);
  if (kinds && kinds.length === 0) {
    return { ok: true, rows: [] };
  }

  const fetched = await fetchPages((from, to) => {
    const query = applyNestedSessionFilters(
      supabase
        .from("session_registrations")
        .select(
          `id, status, parent_note, created_at, player_id, session_id, players (${PLAYER_SELECT}), training_sessions!inner (${SESSION_SELECT}), session_registration_messages (id)`,
        ) as unknown as SessionJoinQuery,
      filters,
    );
    return query.range(from, to);
  });
  if (!fetched.ok) {
    return fetched;
  }

  const mapped: RegistrationSourceRow[] = [];
  const playerIds: { playerId: string; teamId: string }[] = [];
  for (const raw of fetched.rows) {
    const row = raw as Record<string, unknown>;
    const session = mapSession(row.training_sessions);
    const player = mapPlayer(row.players);
    if (!session || !player) {
      continue;
    }
    const messages = (row.session_registration_messages as { id: string }[] | null) ?? [];
    mapped.push({
      session,
      playerId: String(row.player_id),
      player,
      jersey: null,
      status: row.status as SessionRegistrationStatus,
      parentNote: (row.parent_note as string | null) ?? null,
      registeredAt: String(row.created_at ?? ""),
      hasQa: messages.length > 0,
    });
    playerIds.push({ playerId: String(row.player_id), teamId: session.team_id });
  }
  const filtered = filterRegistrationRows(mapped, filters);
  if (reportCap(filtered.length)) {
    return { ok: false, errorKey: "reportTooManyRows" };
  }
  const jerseys = await loadJerseys(supabase, playerIds);
  return {
    ok: true,
    rows: filtered
      .map((row) => ({
        ...row,
        jersey: jerseys.get(`${row.playerId}:${row.session.team_id}`) ?? null,
      }))
      .sort(sortBySessionThenPlayer),
  };
}

export async function queryLedgerReport(
  supabase: AdminClient,
  filters: ReportFilters,
): Promise<QueryResult<LedgerSourceRow>> {
  const kinds = kindsForReport(filters);
  if (kinds && kinds.length === 0) {
    return { ok: true, rows: [] };
  }

  const fetched = await fetchPages((from, to) => {
    let query = supabase
      .from("session_credit_ledger")
      .select(
        `player_id, entry_type, amount, session_id, actor_user_id, created_at, players (${PLAYER_SELECT}), training_sessions (${SESSION_SELECT})`,
      )
      .order("created_at", { ascending: true });
    if (filters.sessionId) {
      query = query.eq("session_id", filters.sessionId);
    }
    const bounds = reportDateBounds(filters);
    if (bounds && !filters.sessionId) {
      query = query.gte("created_at", bounds.from).lt("created_at", bounds.toExclusive);
    }
    return Promise.resolve(query.range(from, to));
  });
  if (!fetched.ok) {
    return fetched;
  }

  const actorIds = fetched.rows.map((raw) => String((raw as Record<string, unknown>).actor_user_id ?? ""));
  const roles = await loadActorRoles(supabase, actorIds);

  const mapped: LedgerSourceRow[] = [];
  for (const raw of fetched.rows) {
    const row = raw as Record<string, unknown>;
    const player = mapPlayer(row.players);
    if (!player) {
      continue;
    }
    mapped.push({
      playerId: String(row.player_id),
      player,
      createdAt: String(row.created_at ?? ""),
      entryType: row.entry_type as CreditLedgerEntryType,
      amount: Number(row.amount ?? 0),
      session: mapSession(row.training_sessions),
      actorRoles: roles.get(String(row.actor_user_id ?? "")) ?? [],
    });
  }
  const filtered = filterLedgerRows(mapped, filters);
  if (reportCap(filtered.length)) {
    return { ok: false, errorKey: "reportTooManyRows" };
  }
  return { ok: true, rows: filtered };
}

export async function queryMatchRosterReport(
  supabase: AdminClient,
  filters: ReportFilters,
): Promise<QueryResult<MatchRosterSourceRow>> {
  const kinds = kindsForReport({ ...filters, reportType: "match_roster" });
  if (kinds && kinds.length === 0) {
    return { ok: true, rows: [] };
  }

  let publicationsQuery = supabase
    .from("match_publications")
    .select(`session_id, is_published, public_status, opponent, training_sessions!inner (${SESSION_SELECT})`);
  if (filters.sessionId) {
    publicationsQuery = publicationsQuery.eq("session_id", filters.sessionId);
  } else {
    if (kinds && kinds.length > 0) {
      publicationsQuery = publicationsQuery.in("training_sessions.kind", kinds);
    }
    const units = selectedUnitIds(filters);
    if (units.length > 0) {
      publicationsQuery = publicationsQuery.in("training_sessions.team_id", units);
    }
    if (!filters.includeDeleted) {
      publicationsQuery = publicationsQuery.is("training_sessions.deleted_at", null);
    }
    const bounds = reportDateBounds(filters);
    if (bounds) {
      publicationsQuery = publicationsQuery
        .gte("training_sessions.starts_at", bounds.from)
        .lt("training_sessions.starts_at", bounds.toExclusive);
    }
  }

  const publications = await publicationsQuery;
  if (publications.error) {
    console.error("report match publications", publications.error.message);
    return { ok: false, errorKey: "generic" };
  }

  const bySession = new Map<
    string,
    { session: ReportSessionRef; opponent: string | null; isPublished: boolean; publicStatus: MatchPublicStatus }
  >();
  for (const row of publications.data ?? []) {
    const session = mapSession(
      (row as { training_sessions: unknown }).training_sessions,
    );
    if (!session || !sessionPassesFilters(session, filters)) {
      continue;
    }
    bySession.set(session.id, {
      session,
      opponent: (row as { opponent: string | null }).opponent,
      isPublished: Boolean((row as { is_published: boolean }).is_published),
      publicStatus: (row as { public_status: MatchPublicStatus }).public_status,
    });
  }
  const sessionIds = [...bySession.keys()];
  if (sessionIds.length === 0) {
    return { ok: true, rows: [] };
  }

  const rosterRows: MatchRosterSourceRow[] = [];
  for (const ids of chunk(sessionIds, 200)) {
    const fetched = await fetchPages((from, to) =>
      Promise.resolve(
        supabase
          .from("match_roster")
          .select(`jersey_number, player_id, session_id, players (${PLAYER_SELECT})`)
          .in("session_id", ids)
          .range(from, to),
      ),
    );
    if (!fetched.ok) {
      return fetched;
    }
    for (const raw of fetched.rows) {
      const row = raw as Record<string, unknown>;
      const pub = bySession.get(String(row.session_id));
      const player = mapPlayer(row.players);
      if (!pub || !player) {
        continue;
      }
      rosterRows.push({
        session: pub.session,
        opponent: pub.opponent,
        isPublished: pub.isPublished,
        publicStatus: pub.publicStatus,
        player,
        jersey: Number(row.jersey_number),
      });
    }
  }
  const filtered = filterMatchRosterRows(rosterRows, filters);
  if (reportCap(filtered.length)) {
    return { ok: false, errorKey: "reportTooManyRows" };
  }
  return {
    ok: true,
    rows: filtered.sort((a, b) => {
      const bySession = sortBySessionThenPlayer(a, b);
      if (bySession !== 0) {
        return bySession;
      }
      return a.jersey - b.jersey;
    }),
  };
}


