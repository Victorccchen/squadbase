import { createClient } from "@/lib/supabase/server";
import type {
  Coach,
  CoachTeamAssignment,
  GuardianPlayerLink,
  LinkableTeam,
  Player,
  Profile,
  Team,
  TeamMembership,
} from "@/lib/supabase/database.types";

export type MembershipWithTeam = TeamMembership & { team: Team | null };

export type PlayerWithMembership = Player & {
  membership: MembershipWithTeam | null;
  memberships: MembershipWithTeam[];
};

export type CoachWithProfile = Coach & {
  profile: Profile | null;
  assignments: (CoachTeamAssignment & { team: Team | null })[];
};

export type RosterRow = {
  membership: TeamMembership;
  player: Player;
  team: Team;
};

export async function listTeams(): Promise<Team[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .order("name");

  if (error) {
    console.error("listTeams", error.message);
    return [];
  }

  return data ?? [];
}

export type TeamAdminRow = Team & {
  membershipCount: number;
  activeMembershipCount: number;
  coachAssignmentCount: number;
};

export async function listTeamsForAdmin(): Promise<TeamAdminRow[]> {
  const supabase = await createClient();
  const [teamsResult, membershipsResult, assignmentsResult] = await Promise.all([
    supabase.from("teams").select("*").order("name"),
    supabase.from("team_memberships").select("team_id, status"),
    supabase.from("coach_team_assignments").select("team_id"),
  ]);

  if (teamsResult.error) {
    console.error("listTeamsForAdmin", teamsResult.error.message);
    return [];
  }
  if (membershipsResult.error) {
    console.error("listTeamsForAdmin memberships", membershipsResult.error.message);
  }
  if (assignmentsResult.error) {
    console.error("listTeamsForAdmin assignments", assignmentsResult.error.message);
  }

  const membershipByTeam = new Map<string, { total: number; active: number }>();
  for (const row of membershipsResult.data ?? []) {
    const current = membershipByTeam.get(row.team_id) ?? { total: 0, active: 0 };
    current.total += 1;
    if (row.status === "active") {
      current.active += 1;
    }
    membershipByTeam.set(row.team_id, current);
  }

  const coachesByTeam = new Map<string, number>();
  for (const row of assignmentsResult.data ?? []) {
    coachesByTeam.set(row.team_id, (coachesByTeam.get(row.team_id) ?? 0) + 1);
  }

  return (teamsResult.data ?? []).map((team) => {
    const membership = membershipByTeam.get(team.id) ?? { total: 0, active: 0 };
    return {
      ...team,
      membershipCount: membership.total,
      activeMembershipCount: membership.active,
      coachAssignmentCount: coachesByTeam.get(team.id) ?? 0,
    };
  });
}

export async function getTeam(id: string): Promise<Team | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getTeam", error.message);
    return null;
  }

  return data;
}

function mapMembershipRow(
  row: TeamMembership & { teams: Team | Team[] | null },
): MembershipWithTeam {
  const nestedTeam = row.teams;
  const team = Array.isArray(nestedTeam) ? nestedTeam[0] ?? null : nestedTeam;
  return {
    id: row.id,
    player_id: row.player_id,
    team_id: row.team_id,
    jersey_number: row.jersey_number,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    updated_by: row.updated_by,
    team,
  };
}

function sortMemberships(rows: MembershipWithTeam[]): MembershipWithTeam[] {
  return [...rows].sort((a, b) => {
    if (a.status === "active" && b.status !== "active") {
      return -1;
    }
    if (a.status !== "active" && b.status === "active") {
      return 1;
    }
    return a.updated_at < b.updated_at ? 1 : -1;
  });
}

function mapPlayerMemberships(
  rows: (TeamMembership & { teams: Team | Team[] | null })[] | null,
): { membership: MembershipWithTeam | null; memberships: MembershipWithTeam[] } {
  const memberships = sortMemberships((rows ?? []).map(mapMembershipRow));
  const current =
    memberships.find((row) => row.status === "active") ?? memberships[0] ?? null;
  return { membership: current, memberships };
}

export function formatActiveMembershipSummary(
  memberships: MembershipWithTeam[] | undefined,
): string | null {
  const labels = (memberships ?? [])
    .filter((row): row is MembershipWithTeam & { team: Team } =>
      row.status === "active" && row.team !== null,
    )
    .map((row) => `${row.team.name} · #${row.jersey_number}`);
  if (labels.length === 0) {
    return null;
  }
  return labels.join(" · ");
}

export async function listPlayers(): Promise<PlayerWithMembership[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("players")
    .select("*, team_memberships(*, teams(*))")
    .order("name_en_family")
    .order("name_en_given");

  if (error) {
    console.error("listPlayers", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const { team_memberships, ...player } = row;
    return {
      ...(player as Player),
      ...mapPlayerMemberships(
        team_memberships as (TeamMembership & { teams: Team | Team[] | null })[] | null,
      ),
    };
  });
}

export async function getPlayer(id: string): Promise<PlayerWithMembership | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("players")
    .select("*, team_memberships(*, teams(*))")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getPlayer", error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  const { team_memberships, ...player } = data;
  return {
    ...(player as Player),
    ...mapPlayerMemberships(
      team_memberships as (TeamMembership & { teams: Team | Team[] | null })[] | null,
    ),
  };
}

export async function listCoaches(): Promise<CoachWithProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coaches")
    .select("*, profiles(*), coach_team_assignments(*, teams(*))")
    .order("created_at");

  if (error) {
    console.error("listCoaches", error.message);
    return [];
  }

  return (data ?? []).map((row) =>
    mapCoachRow(
      row as {
        profiles: Profile | Profile[] | null;
        coach_team_assignments:
          | (CoachTeamAssignment & { teams: Team | Team[] | null })[]
          | null;
        [key: string]: unknown;
      },
    ),
  );
}

function mapCoachRow(row: {
  profiles: Profile | Profile[] | null;
  coach_team_assignments:
    | (CoachTeamAssignment & { teams: Team | Team[] | null })[]
    | null;
  [key: string]: unknown;
}): CoachWithProfile {
  const { profiles, coach_team_assignments, ...coach } = row;
  const profile = Array.isArray(profiles) ? profiles[0] ?? null : profiles;
  const assignments = (coach_team_assignments ?? []).map((assignment) => {
    const { teams, ...rest } = assignment;
    return {
      ...rest,
      team: Array.isArray(teams) ? teams[0] ?? null : teams,
    };
  });

  return {
    ...(coach as Coach),
    profile,
    assignments,
  };
}

export async function getCoach(id: string): Promise<CoachWithProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coaches")
    .select("*, profiles(*), coach_team_assignments(*, teams(*))")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getCoach", error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  return mapCoachRow(
    data as {
      profiles: Profile | Profile[] | null;
      coach_team_assignments:
        | (CoachTeamAssignment & { teams: Team | Team[] | null })[]
        | null;
      [key: string]: unknown;
    },
  );
}

export async function listLinkableProfiles(excludeProfileIds: string[]): Promise<Profile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("phone");

  if (error) {
    console.error("listLinkableProfiles", error.message);
    return [];
  }

  const excluded = new Set(excludeProfileIds);
  return (data ?? []).filter((profile) => !excluded.has(profile.id));
}

function toRosterRow(row: {
  players: Player | Player[] | null;
  teams: Team | Team[] | null;
  [key: string]: unknown;
}): RosterRow | null {
  const { players, teams, ...membership } = row;
  const player = Array.isArray(players) ? players[0] ?? null : players;
  const team = Array.isArray(teams) ? teams[0] ?? null : teams;
  if (!player || !team) {
    return null;
  }
  return {
    membership: membership as TeamMembership,
    player,
    team,
  };
}

export async function listTeamPlayers(teamId: string): Promise<RosterRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_memberships")
    .select("*, players(*), teams(*)")
    .eq("team_id", teamId)
    .order("jersey_number");

  if (error) {
    console.error("listTeamPlayers", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) =>
      toRosterRow(
        row as {
          players: Player | Player[] | null;
          teams: Team | Team[] | null;
          [key: string]: unknown;
        },
      ),
    )
    .filter((row): row is RosterRow => row !== null);
}

export async function listRoster(): Promise<RosterRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_memberships")
    .select("*, players(*), teams(*)")
    .eq("status", "active")
    .order("jersey_number");

  if (error) {
    console.error("listRoster", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) =>
      toRosterRow(
        row as {
          players: Player | Player[] | null;
          teams: Team | Team[] | null;
          [key: string]: unknown;
        },
      ),
    )
    .filter((row): row is RosterRow => {
      if (!row) {
        return false;
      }
      return row.player.status === "active" && row.team.status === "active";
    });
}

export type GuardianLinkWithPlayer = GuardianPlayerLink & {
  player: PlayerWithMembership | null;
  guardian: Profile | null;
};

function mapPlayerEmbed(
  player: (Player & { team_memberships?: (TeamMembership & { teams: Team | Team[] | null })[] | null }) | Player[] | null,
): PlayerWithMembership | null {
  const row = Array.isArray(player) ? player[0] ?? null : player;
  if (!row) {
    return null;
  }
  const { team_memberships, ...rest } = row as Player & {
    team_memberships?: (TeamMembership & { teams: Team | Team[] | null })[] | null;
  };
  return {
    ...(rest as Player),
    ...mapPlayerMemberships(team_memberships ?? null),
  };
}

function mapLinkRow(row: Record<string, unknown>): GuardianLinkWithPlayer {
  const { players, profiles, ...link } = row;
  const guardianSource = profiles as Profile | Profile[] | null | undefined;
  const guardian = Array.isArray(guardianSource)
    ? guardianSource[0] ?? null
    : guardianSource ?? null;
  return {
    ...(link as GuardianPlayerLink),
    player: mapPlayerEmbed(
      (players as
        | (Player & { team_memberships?: (TeamMembership & { teams: Team | Team[] | null })[] | null })
        | Player[]
        | null) ?? null,
    ),
    guardian,
  };
}

export async function listActiveTeamsForLink(): Promise<LinkableTeam[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_active_teams_for_link");

  if (error) {
    console.error("listActiveTeamsForLink", error.message);
    return [];
  }

  return data ?? [];
}

export async function listOwnGuardianLinks(): Promise<GuardianLinkWithPlayer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guardian_player_links")
    .select("*, players(*, team_memberships(*, teams(*)))")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listOwnGuardianLinks", error.message);
    return [];
  }

  return (data ?? []).map((row) => mapLinkRow(row as unknown as Record<string, unknown>));
}

export async function listGuardianLinksForAdmin(): Promise<GuardianLinkWithPlayer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guardian_player_links")
    .select("*, players(*, team_memberships(*, teams(*))), profiles!guardian_player_links_guardian_user_id_fkey(*)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listGuardianLinksForAdmin", error.message);
    return [];
  }

  return (data ?? []).map((row) => mapLinkRow(row as unknown as Record<string, unknown>));
}

export async function countCoachAssignmentsForTeam(teamId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("coach_team_assignments")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);

  if (error) {
    console.error("countCoachAssignmentsForTeam", error.message);
    return 0;
  }

  return count ?? 0;
}
