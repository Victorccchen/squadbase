import { createClient } from "@/lib/supabase/server";
import type {
  Coach,
  CoachTeamAssignment,
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
