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

export type PlayerWithMembership = Player & {
  membership: (TeamMembership & { team: Team | null }) | null;
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

function pickCurrentMembership(
  rows: (TeamMembership & { teams: Team | Team[] | null })[] | null,
): (TeamMembership & { team: Team | null }) | null {
  if (!rows || rows.length === 0) {
    return null;
  }

  const sorted = [...rows].sort((a, b) =>
    a.updated_at < b.updated_at ? 1 : -1,
  );
  const current = sorted[0];
  const nestedTeam = current.teams;
  const team = Array.isArray(nestedTeam) ? nestedTeam[0] ?? null : nestedTeam;

  return {
    id: current.id,
    player_id: current.player_id,
    team_id: current.team_id,
    jersey_number: current.jersey_number,
    status: current.status,
    created_at: current.created_at,
    updated_at: current.updated_at,
    created_by: current.created_by,
    updated_by: current.updated_by,
    team,
  };
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
      membership: pickCurrentMembership(
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
    membership: pickCurrentMembership(
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

function mapMembershipEmbed(
  rows: (TeamMembership & { teams: Team | Team[] | null })[] | null,
): (TeamMembership & { team: Team | null }) | null {
  return pickCurrentMembership(rows);
}

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
    membership: mapMembershipEmbed(team_memberships ?? null),
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
