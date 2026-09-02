export type AppRole = "parent" | "coach" | "admin" | "player";
export type AgeBand =
  | "U6"
  | "U8"
  | "U10"
  | "U12"
  | "U15"
  | "U18"
  | "reserve"
  | "senior";
export type OrgStatus = "active" | "inactive";

export type Profile = {
  id: string;
  phone: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type UserRole = {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type Team = {
  id: string;
  name: string;
  age_band: AgeBand;
  status: OrgStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type Player = {
  id: string;
  name_zh: string;
  name_en: string;
  name_ja: string;
  birth_date: string;
  status: OrgStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TeamMembership = {
  id: string;
  player_id: string;
  team_id: string;
  jersey_number: number;
  status: OrgStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type Coach = {
  id: string;
  profile_id: string;
  status: OrgStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type CoachTeamAssignment = {
  id: string;
  coach_id: string;
  team_id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

type TimestampInsert = {
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          phone?: string | null;
          display_name?: string | null;
        } & TimestampInsert;
        Update: {
          phone?: string | null;
          display_name?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      user_roles: {
        Row: UserRole;
        Insert: {
          id?: string;
          user_id: string;
          role: AppRole;
        } & TimestampInsert;
        Update: {
          role?: AppRole;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      teams: {
        Row: Team;
        Insert: {
          id?: string;
          name: string;
          age_band: AgeBand;
          status?: OrgStatus;
        } & TimestampInsert;
        Update: {
          name?: string;
          age_band?: AgeBand;
          status?: OrgStatus;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      players: {
        Row: Player;
        Insert: {
          id?: string;
          name_zh: string;
          name_en: string;
          name_ja: string;
          birth_date: string;
          status?: OrgStatus;
        } & TimestampInsert;
        Update: {
          name_zh?: string;
          name_en?: string;
          name_ja?: string;
          birth_date?: string;
          status?: OrgStatus;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      team_memberships: {
        Row: TeamMembership;
        Insert: {
          id?: string;
          player_id: string;
          team_id: string;
          jersey_number: number;
          status?: OrgStatus;
        } & TimestampInsert;
        Update: {
          player_id?: string;
          team_id?: string;
          jersey_number?: number;
          status?: OrgStatus;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "team_memberships_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_memberships_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      coaches: {
        Row: Coach;
        Insert: {
          id?: string;
          profile_id: string;
          status?: OrgStatus;
        } & TimestampInsert;
        Update: {
          profile_id?: string;
          status?: OrgStatus;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "coaches_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      coach_team_assignments: {
        Row: CoachTeamAssignment;
        Insert: {
          id?: string;
          coach_id: string;
          team_id: string;
        } & TimestampInsert;
        Update: {
          coach_id?: string;
          team_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "coach_team_assignments_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coach_team_assignments_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      ensure_own_profile: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      has_role: {
        Args: { check_role: AppRole };
        Returns: boolean;
      };
      current_coach_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      is_assigned_coach_for_team: {
        Args: { p_team_id: string };
        Returns: boolean;
      };
      coach_can_read_player: {
        Args: { p_player_id: string };
        Returns: boolean;
      };
      admin_link_coach: {
        Args: { target_profile_id: string };
        Returns: string;
      };
    };
    Enums: {
      app_role: AppRole;
      age_band: AgeBand;
      org_status: OrgStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
