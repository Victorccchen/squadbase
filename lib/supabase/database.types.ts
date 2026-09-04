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
export type GuardianRelation = "parent" | "guardian" | "other";
export type LinkStatus = "pending" | "approved" | "rejected" | "revoked";
export type SessionRegistrationStatus = "registered" | "cancelled";
export type SessionMessageAuthorRole = "parent" | "admin";
export type SessionKind = "regular" | "special" | "cup" | "league";
export type PackageAgeBand = "U8" | "U10_U18";
export type PaymentClaimStatus = "pending" | "approved" | "rejected";
export type AttendanceStatus = "present" | "excused_absent" | "unexcused_absent";
export type CreditLedgerEntryType =
  | "purchase"
  | "attend_debit"
  | "no_show_debit"
  | "match_debit"
  | "admin_adjust"
  | "reversal";
export type LeaveRequestStatus = "pending" | "approved" | "rejected";

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
  name_zh: string | null;
  name_en_given: string;
  name_en_family: string;
  name_ja: string | null;
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

export type GuardianPlayerLink = {
  id: string;
  guardian_user_id: string;
  player_id: string;
  relation: GuardianRelation;
  status: LinkStatus;
  parent_note: string | null;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type SessionSeries = {
  id: string;
  team_id: string;
  title: string;
  kind: SessionKind;
  location: string | null;
  notes: string | null;
  status: OrgStatus;
  weekdays: number[] | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TrainingSession = {
  id: string;
  team_id: string;
  title: string;
  kind: SessionKind;
  series_id: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  status: OrgStatus;
  notes: string | null;
  deleted_at: string | null;
  is_playoff: boolean;
  no_debit: boolean;
  debit_override_n: number | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type SessionRegistration = {
  id: string;
  session_id: string;
  player_id: string;
  guardian_user_id: string;
  status: SessionRegistrationStatus;
  parent_note: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type SessionPackage = {
  id: string;
  age_band: PackageAgeBand;
  credits: number;
  price_twd: number;
  active: boolean;
  effective_from: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type PlayerSessionBalance = {
  player_id: string;
  credits_available: number;
  avg_unit_cost_twd: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type PaymentClaim = {
  id: string;
  player_id: string;
  guardian_user_id: string;
  package_id: string;
  last5: string;
  status: PaymentClaimStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type SessionCreditLedger = {
  id: string;
  player_id: string;
  entry_type: CreditLedgerEntryType;
  amount: number;
  unit_cost_twd: number | null;
  amount_twd: number | null;
  package_id: string | null;
  claim_id: string | null;
  session_id: string | null;
  attendance_id: string | null;
  actor_user_id: string | null;
  reason: string | null;
  created_at: string;
};

export type SessionAttendance = {
  id: string;
  session_id: string;
  player_id: string;
  status: AttendanceStatus;
  credits_debited: number;
  marked_by: string | null;
  marked_at: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type SessionLeaveRequest = {
  id: string;
  registration_id: string;
  status: LeaveRequestStatus;
  parent_note: string | null;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type ClubRuntimeSetting = {
  key: string;
  value: string;
  updated_at: string;
  updated_by: string | null;
};

export type SessionRegistrationMessage = {
  id: string;
  registration_id: string;
  author_user_id: string;
  author_role: SessionMessageAuthorRole;
  body: string;
  created_at: string;
};

export type PlayerSearchMatch = {
  id: string;
  name_zh: string | null;
  name_en_given: string;
  name_en_family: string;
  name_ja: string | null;
  birth_date: string;
  team_id: string | null;
  team_name: string | null;
  jersey_number: number | null;
};

export type LinkableTeam = {
  id: string;
  name: string;
  age_band: AgeBand;
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
          name_zh?: string | null;
          name_en_given: string;
          name_en_family: string;
          name_ja?: string | null;
          birth_date: string;
          status?: OrgStatus;
        } & TimestampInsert;
        Update: {
          name_zh?: string | null;
          name_en_given?: string;
          name_en_family?: string;
          name_ja?: string | null;
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
      guardian_player_links: {
        Row: GuardianPlayerLink;
        Insert: {
          id?: string;
          guardian_user_id: string;
          player_id: string;
          relation?: GuardianRelation;
          status?: LinkStatus;
          parent_note?: string | null;
          admin_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
        } & TimestampInsert;
        Update: {
          guardian_user_id?: string;
          player_id?: string;
          relation?: GuardianRelation;
          status?: LinkStatus;
          parent_note?: string | null;
          admin_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "guardian_player_links_guardian_user_id_fkey";
            columns: ["guardian_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "guardian_player_links_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
        ];
      };
      session_series: {
        Row: SessionSeries;
        Insert: {
          id?: string;
          team_id: string;
          title: string;
          kind: SessionKind;
          location?: string | null;
          notes?: string | null;
          status?: OrgStatus;
          weekdays?: number[] | null;
          deleted_at?: string | null;
        } & TimestampInsert;
        Update: {
          team_id?: string;
          title?: string;
          kind?: SessionKind;
          location?: string | null;
          notes?: string | null;
          status?: OrgStatus;
          weekdays?: number[] | null;
          deleted_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "session_series_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      training_sessions: {
        Row: TrainingSession;
        Insert: {
          id?: string;
          team_id: string;
          title: string;
          kind?: SessionKind;
          series_id?: string | null;
          starts_at: string;
          ends_at: string;
          location?: string | null;
          status?: OrgStatus;
          notes?: string | null;
          deleted_at?: string | null;
          is_playoff?: boolean;
          no_debit?: boolean;
          debit_override_n?: number | null;
        } & TimestampInsert;
        Update: {
          team_id?: string;
          title?: string;
          kind?: SessionKind;
          series_id?: string | null;
          starts_at?: string;
          ends_at?: string;
          location?: string | null;
          status?: OrgStatus;
          notes?: string | null;
          deleted_at?: string | null;
          is_playoff?: boolean;
          no_debit?: boolean;
          debit_override_n?: number | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "training_sessions_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_sessions_series_id_fkey";
            columns: ["series_id"];
            isOneToOne: false;
            referencedRelation: "session_series";
            referencedColumns: ["id"];
          },
        ];
      };
      session_registrations: {
        Row: SessionRegistration;
        Insert: {
          id?: string;
          session_id: string;
          player_id: string;
          guardian_user_id: string;
          status?: SessionRegistrationStatus;
          parent_note?: string | null;
        } & TimestampInsert;
        Update: {
          session_id?: string;
          player_id?: string;
          guardian_user_id?: string;
          status?: SessionRegistrationStatus;
          parent_note?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "session_registrations_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "training_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_registrations_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_registrations_guardian_user_id_fkey";
            columns: ["guardian_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      session_registration_messages: {
        Row: SessionRegistrationMessage;
        Insert: {
          id?: string;
          registration_id: string;
          author_user_id: string;
          author_role: SessionMessageAuthorRole;
          body: string;
          created_at?: string;
        };
        Update: {
          body?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_registration_messages_registration_id_fkey";
            columns: ["registration_id"];
            isOneToOne: false;
            referencedRelation: "session_registrations";
            referencedColumns: ["id"];
          },
        ];
      };
      session_packages: {
        Row: SessionPackage;
        Insert: {
          id?: string;
          age_band: PackageAgeBand;
          credits: number;
          price_twd: number;
          active?: boolean;
          effective_from?: string;
        } & TimestampInsert;
        Update: {
          age_band?: PackageAgeBand;
          credits?: number;
          price_twd?: number;
          active?: boolean;
          effective_from?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      player_session_balances: {
        Row: PlayerSessionBalance;
        Insert: {
          player_id: string;
          credits_available?: number;
          avg_unit_cost_twd?: number;
        } & TimestampInsert;
        Update: {
          credits_available?: number;
          avg_unit_cost_twd?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "player_session_balances_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: true;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_claims: {
        Row: PaymentClaim;
        Insert: {
          id?: string;
          player_id: string;
          guardian_user_id: string;
          package_id: string;
          last5: string;
          status?: PaymentClaimStatus;
          admin_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
        } & TimestampInsert;
        Update: {
          status?: PaymentClaimStatus;
          admin_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payment_claims_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_claims_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "session_packages";
            referencedColumns: ["id"];
          },
        ];
      };
      session_credit_ledger: {
        Row: SessionCreditLedger;
        Insert: {
          id?: string;
          player_id: string;
          entry_type: CreditLedgerEntryType;
          amount: number;
          unit_cost_twd?: number | null;
          amount_twd?: number | null;
          package_id?: string | null;
          claim_id?: string | null;
          session_id?: string | null;
          attendance_id?: string | null;
          actor_user_id?: string | null;
          reason?: string | null;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      session_attendance: {
        Row: SessionAttendance;
        Insert: {
          id?: string;
          session_id: string;
          player_id: string;
          status: AttendanceStatus;
          credits_debited?: number;
          marked_by?: string | null;
          marked_at?: string;
        } & TimestampInsert;
        Update: {
          status?: AttendanceStatus;
          credits_debited?: number;
          marked_by?: string | null;
          marked_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "session_attendance_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "training_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_attendance_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
        ];
      };
      session_leave_requests: {
        Row: SessionLeaveRequest;
        Insert: {
          id?: string;
          registration_id: string;
          status?: LeaveRequestStatus;
          parent_note?: string | null;
          admin_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
        } & TimestampInsert;
        Update: {
          status?: LeaveRequestStatus;
          parent_note?: string | null;
          admin_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "session_leave_requests_registration_id_fkey";
            columns: ["registration_id"];
            isOneToOne: false;
            referencedRelation: "session_registrations";
            referencedColumns: ["id"];
          },
        ];
      };
      club_runtime_settings: {
        Row: ClubRuntimeSetting;
        Insert: {
          key: string;
          value?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          value?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
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
      is_approved_guardian_for_player: {
        Args: { p_player_id: string };
        Returns: boolean;
      };
      guardian_can_read_team: {
        Args: { p_team_id: string };
        Returns: boolean;
      };
      list_active_teams_for_link: {
        Args: Record<PropertyKey, never>;
        Returns: LinkableTeam[];
      };
      search_player_for_guardian_link: {
        Args: {
          p_team_id?: string | null;
          p_jersey?: number | null;
          p_birth_date?: string | null;
          p_name_fragment?: string | null;
        };
        Returns: PlayerSearchMatch[];
      };
      admin_review_guardian_link: {
        Args: {
          p_link_id: string;
          p_status: LinkStatus;
          p_admin_note?: string | null;
        };
        Returns: string;
      };
      admin_revoke_guardian_link: {
        Args: {
          p_link_id: string;
          p_admin_note?: string | null;
        };
        Returns: string;
      };
      admin_delete_team: {
        Args: {
          p_team_id: string;
        };
        Returns: string;
      };
      guardian_can_read_session: {
        Args: { p_session_id: string };
        Returns: boolean;
      };
      coach_can_read_session: {
        Args: { p_session_id: string };
        Returns: boolean;
      };
      register_player_for_session: {
        Args: {
          p_session_id: string;
          p_player_id: string;
          p_parent_note?: string | null;
        };
        Returns: string;
      };
      cancel_session_registration: {
        Args: { p_registration_id: string };
        Returns: string;
      };
      switch_session_registration: {
        Args: {
          p_registration_id: string;
          p_new_session_id: string;
        };
        Returns: string;
      };
      post_session_registration_message: {
        Args: {
          p_registration_id: string;
          p_body: string;
          p_author_role: SessionMessageAuthorRole;
        };
        Returns: string;
      };
      admin_create_session_series: {
        Args: {
          p_team_id: string;
          p_title: string;
          p_kind: SessionKind;
          p_starts_at: string;
          p_ends_at: string;
          p_location?: string | null;
          p_notes?: string | null;
          p_status?: OrgStatus;
          p_until_date?: string | null;
          p_week_count?: number | null;
          p_weekdays?: number[] | null;
        };
        Returns: string;
      };
      admin_soft_delete_session: {
        Args: { p_session_id: string };
        Returns: string;
      };
      admin_soft_delete_session_series: {
        Args: { p_series_id: string };
        Returns: string;
      };
      submit_payment_claim: {
        Args: {
          p_player_id: string;
          p_package_id: string;
          p_last5: string;
        };
        Returns: string;
      };
      admin_review_payment_claim: {
        Args: {
          p_claim_id: string;
          p_status: PaymentClaimStatus;
          p_admin_note?: string | null;
        };
        Returns: string;
      };
      admin_adjust_session_credits: {
        Args: {
          p_player_id: string;
          p_amount: number;
          p_reason: string;
        };
        Returns: string;
      };
      admin_upsert_session_package: {
        Args: {
          p_id: string | null;
          p_age_band: PackageAgeBand;
          p_credits: number;
          p_price_twd: number;
          p_active: boolean;
        };
        Returns: string;
      };
      admin_set_session_debit_override: {
        Args: {
          p_session_id: string;
          p_no_debit: boolean;
          p_debit_override_n: number | null;
        };
        Returns: string;
      };
      admin_set_club_setting: {
        Args: {
          p_key: string;
          p_value: string;
        };
        Returns: string;
      };
      request_excused_leave: {
        Args: {
          p_registration_id: string;
          p_parent_note?: string | null;
        };
        Returns: string;
      };
      staff_review_leave_request: {
        Args: {
          p_request_id: string;
          p_status: LeaveRequestStatus;
          p_admin_note?: string | null;
        };
        Returns: string;
      };
      mark_session_attendance: {
        Args: {
          p_session_id: string;
          p_player_id: string;
          p_status: AttendanceStatus;
        };
        Returns: string;
      };
    };
    Enums: {
      app_role: AppRole;
      age_band: AgeBand;
      org_status: OrgStatus;
      guardian_relation: GuardianRelation;
      link_status: LinkStatus;
      session_registration_status: SessionRegistrationStatus;
      session_message_author_role: SessionMessageAuthorRole;
      session_kind: SessionKind;
      package_age_band: PackageAgeBand;
      payment_claim_status: PaymentClaimStatus;
      attendance_status: AttendanceStatus;
      credit_ledger_entry_type: CreditLedgerEntryType;
      leave_request_status: LeaveRequestStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
