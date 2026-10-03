/** director (PR-08b): youth director, collects cash, closes the day, records deposits. */
export type AppRole = "parent" | "coach" | "admin" | "player" | "director";
export type AgeBand =
  | "U6"
  | "U8"
  | "U10"
  | "U12"
  | "U15"
  | "U18"
  | "reserve"
  | "senior";
export type TeamKind = "age_squad" | "competition_team";
export type OrgStatus = "active" | "inactive";
export type GuardianRelation = "parent" | "guardian" | "other";
export type LinkStatus = "pending" | "approved" | "rejected" | "revoked";
/** PR-06: late_cancelled = special/match cancelled by the parent within 24 hours (counts as a no-show). */
export type SessionRegistrationStatus = "registered" | "cancelled" | "late_cancelled";
export type SessionMessageAuthorRole = "parent" | "admin";
export type SessionKind = "regular" | "special" | "cup" | "league" | "friendly";
export type PackageAgeBand = "U8" | "U10_U18";
export type PaymentClaimStatus = "pending" | "approved" | "rejected";

export type TaskStatus = "open" | "snoozed" | "done" | "dismissed";

/** Phase 1 PR-03: staff work item (admin-only read). */
export type Task = {
  id: string;
  kind: string;
  entity_type: string | null;
  entity_id: string | null;
  params: Record<string, unknown>;
  assignee_role: "admin" | "staff" | "director";
  assignee_id: string | null;
  status: TaskStatus;
  due_at: string | null;
  snoozed_until: string | null;
  dedupe_key: string | null;
  created_at: string;
  done_at: string | null;
  done_by: string | null;
};

/** Phase 1 PR-03: append-only change log (admin-only read). */
export type AuditLogEntry = {
  id: number;
  at: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  processed_at: string | null;
};
export type AttendanceStatus = "present" | "excused_absent" | "unexcused_absent";
export type CreditLedgerEntryType =
  | "purchase"
  | "attend_debit"
  | "no_show_debit"
  | "match_debit"
  | "admin_adjust"
  | "reversal"
  /** PR-09: credits left on a paper card, at the card's unit price. */
  | "opening_balance";
export type LeaveRequestStatus = "pending" | "approved" | "rejected";
export type MatchSide = "home" | "away";
export type MatchPublicStatus = "scheduled" | "postponed" | "completed" | "cancelled";
export type MatchEmbedCheckStatus = "unknown" | "ok" | "blocked" | "not_found";
export type NoticeTemplateKeyDb =
  | "regular_training_signup"
  | "special_training_signup"
  | "match_signup"
  | "match_notes"
  | "thanks"
  | "match_report";
export type NoticeAudienceKeyDb = "age_squad" | "competition_team" | "session_registrations";

export type AssessmentScoreValue = 1 | 2 | 3 | 4 | 5;

export type AssessmentScoreItem = {
  score: AssessmentScoreValue;
  note: string | null;
};

export type AssessmentSituations = {
  attack: AssessmentScoreItem;
  defense: AssessmentScoreItem;
  attack_to_defense: AssessmentScoreItem;
  defense_to_attack: AssessmentScoreItem;
};

export type AssessmentTraits = {
  adaptability: AssessmentScoreItem;
  resilience: AssessmentScoreItem;
  coachability: AssessmentScoreItem;
  team_commitment: AssessmentScoreItem;
};

export type Profile = {
  id: string;
  phone: string | null;
  display_name: string | null;
  /** Phase 1 PR-04: language for messages to this person; null until first sign-in. */
  preferred_language: "zh-Hant" | "ja" | "en" | null;
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
  kind: TeamKind;
  layer_key: string | null;
  eligible_birth_ages: string[] | null;
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
  continues_training: boolean;
  photo_path: string | null;
  photo_updated_at: string | null;
  id_pdf_path: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

/** PR-05: age_squad rows are primary (one active, sets price) or cross (跨上, one active). Null on 隊伍. */
export type SquadRole = "primary" | "cross";

export type TeamMembership = {
  id: string;
  player_id: string;
  team_id: string;
  jersey_number: number;
  status: OrgStatus;
  squad_role: SquadRole | null;
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
  /** PR-06: when no-shows were finalized (staff button or the 24-hour job). */
  attendance_finalized_at: string | null;
  /** PR-07: where the venue QR check-in applies. */
  venue_id: string | null;
  headcount_n: number | null;
  headcount_confirmed_at: string | null;
  headcount_confirmed_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

/** PR-07: a ground with a counter QR. checkin_token is admin-only. */
export type Venue = {
  id: string;
  name: string;
  address: string | null;
  checkin_token: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type AttendanceSource = "staff" | "parent_qr" | "paper_card" | "system";

/** PR-07: parent-facing notice; phase 2 sends it over LINE (sent_at). */
export type ParentNotice = {
  id: string;
  player_id: string;
  kind: "attendance.staff_backfill";
  session_id: string | null;
  params: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
  read_by: string | null;
  sent_at: string | null;
};

export type SessionRegistration = {
  id: string;
  session_id: string;
  player_id: string;
  guardian_user_id: string;
  status: SessionRegistrationStatus;
  parent_note: string | null;
  cancelled_at: string | null;
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

export type PaymentItemKind = "credit_package" | "kit" | "match_fee" | "camp" | "other";

/** PR-08a: what a family can pay for. credit_package items mirror session_packages. */
export type PaymentItem = {
  id: string;
  kind: PaymentItemKind;
  name_i18n: Record<string, string>;
  price_twd: number | null;
  package_id: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

/** PR-08a: invoice owed for an approved payment; invoice_no once issued (D14). */
export type Invoice = {
  id: string;
  payment_type: "transfer_claim" | "cash_receipt";
  payment_id: string;
  player_id: string | null;
  tax_id: string | null;
  title: string | null;
  amount_twd: number;
  invoice_no: string | null;
  issued_at: string | null;
  issued_by: string | null;
  created_at: string;
};

/** PR-08b: cash taken by the youth director; receipt_no is the parent's e-receipt. */
export type CashReceipt = {
  id: string;
  receipt_no: string;
  player_id: string;
  item_id: string;
  package_id: string | null;
  amount_twd: number;
  credits_snapshot: number | null;
  price_twd_snapshot: number | null;
  received_on: string;
  received_at: string;
  received_by: string;
  note: string | null;
  invoice_needed: boolean;
  invoice_tax_id: string | null;
  invoice_title: string | null;
  closing_id: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
};

export type CashClosing = {
  id: string;
  closing_date: string;
  total_twd: number;
  receipt_count: number;
  closed_by: string;
  closed_at: string;
};

export type BankDeposit = {
  id: string;
  deposit_date: string;
  amount_twd: number;
  slip_path: string | null;
  note: string | null;
  recorded_by: string;
  recorded_at: string;
  reconciled_by: string | null;
  reconciled_at: string | null;
};

/** PR-09: a physical session card moved into the system (admin-only read). */
export type PaperCard = {
  id: string;
  player_id: string;
  card_no: string | null;
  package_credits: number | null;
  unit_cost_twd: number;
  squad_marks: string[];
  used_dates: string[];
  remaining: number | null;
  status: "draft" | "confirmed" | "retired";
  /** Private paths in bucket paper-cards; cleared once the photos are removed. */
  photo_paths: string[];
  photos_purged_at: string | null;
  extracted: Record<string, unknown> | null;
  needs_manual: boolean;
  ledger_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
};

/** PR-09: weekly parallel-season check (D7). */
export type PaperCardCheck = {
  id: string;
  player_id: string;
  check_date: string;
  card_remaining: number;
  system_remaining: number;
  matches: boolean;
  note: string | null;
  checked_by: string;
  created_at: string;
};

export type AiJob = {
  id: string;
  kind: "paper_card_extract";
  model: string;
  input_ref: string | null;
  output: unknown;
  status: "succeeded" | "failed" | "refused" | "invalid";
  cost_usd: number | null;
  created_by: string | null;
  created_at: string;
};

export type PaymentClaim = {
  id: string;
  player_id: string;
  guardian_user_id: string;
  /** Null for items that are not credit packages (PR-08a). */
  package_id: string | null;
  item_id: string;
  last5: string;
  status: PaymentClaimStatus;
  method: "transfer" | "cash";
  transfer_date: string | null;
  amount_twd: number;
  invoice_needed: boolean;
  invoice_tax_id: string | null;
  invoice_title: string | null;
  /** Private object path in bucket payment-proofs. */
  screenshot_path: string | null;
  /** Package price (TWD) when the claim was submitted; the amount for other items. */
  price_twd_snapshot: number;
  /** Package credits when the claim was submitted; null for other items. */
  credits_snapshot: number | null;
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
  /** PR-07 */
  source: AttendanceSource;
  checked_in_at: string | null;
  /** PR-09: set when a paper card covers this attendance (never debits). */
  paper_card_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type LeaveReasonCategory = "illness" | "injury" | "family" | "school" | "other";

export type SessionLeaveRequest = {
  id: string;
  registration_id: string;
  status: LeaveRequestStatus;
  parent_note: string | null;
  reason_category: LeaveReasonCategory | null;
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

export type MatchPublication = {
  session_id: string;
  opponent: string | null;
  side: MatchSide;
  is_published: boolean;
  public_status: MatchPublicStatus;
  club_score: number | null;
  opponent_score: number | null;
  result_note: string | null;
  result_entered_at: string | null;
  opponent_club_id: string | null;
  public_venue_id: string | null;
  season_id: string | null;
  competition_id: string | null;
  round_no: number | null;
  round_label: string | null;
  live_stream_url: string | null;
  live_video_id: string | null;
  replay_url: string | null;
  replay_video_id: string | null;
  highlights_url: string | null;
  highlights_video_id: string | null;
  embed_enabled: boolean;
  embed_check_status: MatchEmbedCheckStatus;
  embed_checked_at: string | null;
  video_title: string | null;
  live_window_before_min: number | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type CompetitionKind = "league" | "cup" | "continental" | "friendly";
export type CrestPermission = "unknown" | "granted" | "denied";
export type VenueSurface = "natural" | "artificial" | "mixed";

/** Official-site competition season (e.g. 2026/27). Admin-only table; site reads via site_* RPCs. */
export type Season = {
  id: string;
  label: string;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
  created_at: string;
  updated_at: string;
};

export type Competition = {
  id: string;
  slug: string;
  name_zh: string;
  name_ja: string | null;
  name_en: string | null;
  short: string | null;
  kind: CompetitionKind;
  organizer: string | null;
  created_at: string;
  updated_at: string;
};

/** Public match venue. Not Venue (training venues with QR check-in secrets). */
export type PublicVenue = {
  id: string;
  slug: string;
  name_zh: string;
  name_ja: string | null;
  name_en: string | null;
  address_zh: string | null;
  address_en: string | null;
  lat: number | null;
  lng: number | null;
  map_url: string | null;
  transit_zh: string | null;
  transit_ja: string | null;
  transit_en: string | null;
  parking_zh: string | null;
  parking_ja: string | null;
  parking_en: string | null;
  accessibility_zh: string | null;
  capacity: number | null;
  surface: VenueSurface | null;
  training_venue_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Club = {
  id: string;
  slug: string;
  name_zh: string;
  name_ja: string | null;
  name_en: string | null;
  short_zh: string | null;
  short_en: string | null;
  abbr: string | null;
  crest_path: string | null;
  crest_permission: CrestPermission;
  home_venue_id: string | null;
  website_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  youtube_url: string | null;
  is_self: boolean;
  created_at: string;
  updated_at: string;
};

export type Standing = {
  id: string;
  season_id: string;
  competition_id: string;
  after_round: number;
  club_id: string;
  rank: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  points: number;
  is_official: boolean;
  source_url: string | null;
  fetched_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlayerAssessment = {
  id: string;
  player_id: string;
  assessed_on: string;
  assessor_user_id: string;
  situations: AssessmentSituations;
  traits: AssessmentTraits;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type AssessmentDimensionKind = "trait" | "phase";
export type AssessmentTraitCode = "A" | "B" | "C" | "D";
export type AssessmentPhaseCode =
  | "attack"
  | "defence"
  | "trans_attack"
  | "trans_defence";

export type AssessmentScore = {
  id: string;
  event_id: string;
  dimension_kind: AssessmentDimensionKind;
  dimension_code: AssessmentTraitCode | AssessmentPhaseCode;
  score: AssessmentScoreValue;
};

export type AssessmentEvent = {
  id: string;
  player_id: string;
  assessed_at: string;
  assessor_user_id: string;
  note: string | null;
  session_id: string | null;
  source_assessment_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type AssessmentEventWithScores = AssessmentEvent & {
  scores: AssessmentScore[];
};

export type MatchRosterRow = {
  id: string;
  session_id: string;
  player_id: string;
  jersey_number: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type PublishedMatch = {
  id: string;
  team_id: string;
  team_name: string;
  title: string;
  kind: SessionKind;
  is_playoff: boolean;
  starts_at: string;
  ends_at: string;
  location: string | null;
  opponent: string | null;
  side: MatchSide;
  public_status: MatchPublicStatus;
  club_score: number | null;
  opponent_score: number | null;
  result_note: string | null;
};

export type PublishedMatchRosterEntry = {
  player_id: string;
  name_zh: string | null;
  name_en_given: string;
  name_en_family: string;
  name_ja: string | null;
  jersey_number: number;
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

export type WebPushSubscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type NotificationSend = {
  id: string;
  sent_by: string;
  template_key: NoticeTemplateKeyDb;
  audience_key: NoticeAudienceKeyDb;
  source_session_id: string | null;
  audience_team_id: string | null;
  locale: "zh-Hant" | "en" | "ja";
  title: string;
  body: string;
  url: string;
  intended_count: number;
  subscribed_count: number;
  skipped_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  created_by: string | null;
};

/** Listing and broadcast columns (site API v1). Admin code writes them via RPCs. */
type MatchPublicationListingWrite = {
  opponent_club_id?: string | null;
  public_venue_id?: string | null;
  season_id?: string | null;
  competition_id?: string | null;
  round_no?: number | null;
  round_label?: string | null;
  live_stream_url?: string | null;
  live_video_id?: string | null;
  replay_url?: string | null;
  replay_video_id?: string | null;
  highlights_url?: string | null;
  highlights_video_id?: string | null;
  embed_enabled?: boolean;
  embed_check_status?: MatchEmbedCheckStatus;
  embed_checked_at?: string | null;
  video_title?: string | null;
  live_window_before_min?: number | null;
  result_entered_at?: string | null;
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
          kind?: TeamKind;
          layer_key?: string | null;
          eligible_birth_ages?: string[] | null;
          status?: OrgStatus;
        } & TimestampInsert;
        Update: {
          name?: string;
          age_band?: AgeBand;
          kind?: TeamKind;
          layer_key?: string | null;
          eligible_birth_ages?: string[] | null;
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
          continues_training?: boolean;
          photo_path?: string | null;
          photo_updated_at?: string | null;
          id_pdf_path?: string | null;
        } & TimestampInsert;
        Update: {
          name_zh?: string | null;
          name_en_given?: string;
          name_en_family?: string;
          name_ja?: string | null;
          birth_date?: string;
          status?: OrgStatus;
          continues_training?: boolean;
          photo_path?: string | null;
          photo_updated_at?: string | null;
          id_pdf_path?: string | null;
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
          squad_role?: SquadRole | null;
        } & TimestampInsert;
        Update: {
          player_id?: string;
          team_id?: string;
          jersey_number?: number;
          status?: OrgStatus;
          squad_role?: SquadRole | null;
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
          package_id: string | null;
          item_id: string;
          last5: string;
          status?: PaymentClaimStatus;
          amount_twd: number;
          price_twd_snapshot: number;
          credits_snapshot: number | null;
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
      cash_receipts: {
        Row: CashReceipt;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      cash_closings: {
        Row: CashClosing;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      bank_deposits: {
        Row: BankDeposit;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      bank_deposit_closings: {
        Row: { deposit_id: string; closing_id: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      paper_cards: {
        Row: PaperCard;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      paper_card_unmatched_dates: {
        Row: { card_id: string; used_date: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      paper_card_checks: {
        Row: PaperCardCheck;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      ai_jobs: {
        Row: AiJob;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      payment_items: {
        Row: PaymentItem;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      invoices: {
        Row: Invoice;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      venues: {
        Row: Venue;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      parent_notices: {
        Row: ParentNotice;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      audit_log: {
        Row: AuditLogEntry;
        Insert: never;
        Update: never;
        Relationships: [];
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
      match_publications: {
        Row: MatchPublication;
        Insert: {
          session_id: string;
          opponent?: string | null;
          side: MatchSide;
          is_published?: boolean;
          public_status?: MatchPublicStatus;
          club_score?: number | null;
          opponent_score?: number | null;
          result_note?: string | null;
          published_at?: string | null;
        } & MatchPublicationListingWrite &
          TimestampInsert;
        Update: {
          opponent?: string | null;
          side?: MatchSide;
          is_published?: boolean;
          public_status?: MatchPublicStatus;
          club_score?: number | null;
          opponent_score?: number | null;
          result_note?: string | null;
          published_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        } & MatchPublicationListingWrite;
        Relationships: [
          {
            foreignKeyName: "match_publications_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: true;
            referencedRelation: "training_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      match_roster: {
        Row: MatchRosterRow;
        Insert: {
          id?: string;
          session_id: string;
          player_id: string;
          jersey_number: number;
        } & TimestampInsert;
        Update: {
          session_id?: string;
          player_id?: string;
          jersey_number?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "match_roster_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "match_publications";
            referencedColumns: ["session_id"];
          },
          {
            foreignKeyName: "match_roster_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
        ];
      };
      seasons: {
        Row: Season;
        Insert: {
          id?: string;
          label: string;
          starts_on: string;
          ends_on: string;
          is_current?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          label?: string;
          starts_on?: string;
          ends_on?: string;
          is_current?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      competitions: {
        Row: Competition;
        Insert: {
          id?: string;
          slug: string;
          name_zh: string;
          name_ja?: string | null;
          name_en?: string | null;
          short?: string | null;
          kind: CompetitionKind;
          organizer?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          slug?: string;
          name_zh?: string;
          name_ja?: string | null;
          name_en?: string | null;
          short?: string | null;
          kind?: CompetitionKind;
          organizer?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      public_venues: {
        Row: PublicVenue;
        Insert: {
          id?: string;
          slug: string;
          name_zh: string;
          name_ja?: string | null;
          name_en?: string | null;
          address_zh?: string | null;
          address_en?: string | null;
          lat?: number | null;
          lng?: number | null;
          map_url?: string | null;
          transit_zh?: string | null;
          transit_ja?: string | null;
          transit_en?: string | null;
          parking_zh?: string | null;
          parking_ja?: string | null;
          parking_en?: string | null;
          accessibility_zh?: string | null;
          capacity?: number | null;
          surface?: VenueSurface | null;
          training_venue_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          slug?: string;
          name_zh?: string;
          name_ja?: string | null;
          name_en?: string | null;
          address_zh?: string | null;
          address_en?: string | null;
          lat?: number | null;
          lng?: number | null;
          map_url?: string | null;
          transit_zh?: string | null;
          transit_ja?: string | null;
          transit_en?: string | null;
          parking_zh?: string | null;
          parking_ja?: string | null;
          parking_en?: string | null;
          accessibility_zh?: string | null;
          capacity?: number | null;
          surface?: VenueSurface | null;
          training_venue_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "public_venues_training_venue_id_fkey";
            columns: ["training_venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      clubs: {
        Row: Club;
        Insert: {
          id?: string;
          slug: string;
          name_zh: string;
          name_ja?: string | null;
          name_en?: string | null;
          short_zh?: string | null;
          short_en?: string | null;
          abbr?: string | null;
          crest_path?: string | null;
          crest_permission?: CrestPermission;
          home_venue_id?: string | null;
          website_url?: string | null;
          instagram_url?: string | null;
          facebook_url?: string | null;
          youtube_url?: string | null;
          is_self?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          slug?: string;
          name_zh?: string;
          name_ja?: string | null;
          name_en?: string | null;
          short_zh?: string | null;
          short_en?: string | null;
          abbr?: string | null;
          crest_path?: string | null;
          crest_permission?: CrestPermission;
          home_venue_id?: string | null;
          website_url?: string | null;
          instagram_url?: string | null;
          facebook_url?: string | null;
          youtube_url?: string | null;
          is_self?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clubs_home_venue_id_fkey";
            columns: ["home_venue_id"];
            isOneToOne: false;
            referencedRelation: "public_venues";
            referencedColumns: ["id"];
          },
        ];
      };
      standings: {
        Row: Standing;
        Insert: {
          id?: string;
          season_id: string;
          competition_id: string;
          after_round: number;
          club_id: string;
          rank: number;
          played?: number;
          won?: number;
          drawn?: number;
          lost?: number;
          goals_for?: number;
          goals_against?: number;
          points?: number;
          is_official?: boolean;
          source_url?: string | null;
          fetched_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          after_round?: number;
          rank?: number;
          played?: number;
          won?: number;
          drawn?: number;
          lost?: number;
          goals_for?: number;
          goals_against?: number;
          points?: number;
          is_official?: boolean;
          source_url?: string | null;
          fetched_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "standings_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "standings_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "standings_club_id_fkey";
            columns: ["club_id"];
            isOneToOne: false;
            referencedRelation: "clubs";
            referencedColumns: ["id"];
          },
        ];
      };
      player_assessments: {
        Row: PlayerAssessment;
        Insert: {
          id?: string;
          player_id: string;
          assessed_on: string;
          assessor_user_id: string;
          situations: AssessmentSituations;
          traits: AssessmentTraits;
        } & TimestampInsert;
        Update: {
          assessed_on?: string;
          situations?: AssessmentSituations;
          traits?: AssessmentTraits;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "player_assessments_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_assessments_assessor_user_id_fkey";
            columns: ["assessor_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      assessment_events: {
        Row: AssessmentEvent;
        Insert: {
          id?: string;
          player_id: string;
          assessed_at: string;
          assessor_user_id: string;
          note?: string | null;
          session_id?: string | null;
          source_assessment_id?: string | null;
        } & TimestampInsert;
        Update: {
          assessed_at?: string;
          note?: string | null;
          session_id?: string | null;
          source_assessment_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_events_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessment_events_assessor_user_id_fkey";
            columns: ["assessor_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessment_events_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "training_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessment_events_source_assessment_id_fkey";
            columns: ["source_assessment_id"];
            isOneToOne: true;
            referencedRelation: "player_assessments";
            referencedColumns: ["id"];
          },
        ];
      };
      assessment_scores: {
        Row: AssessmentScore;
        Insert: {
          id?: string;
          event_id: string;
          dimension_kind: AssessmentDimensionKind;
          dimension_code: AssessmentTraitCode | AssessmentPhaseCode;
          score: AssessmentScoreValue;
        };
        Update: {
          dimension_kind?: AssessmentDimensionKind;
          dimension_code?: AssessmentTraitCode | AssessmentPhaseCode;
          score?: AssessmentScoreValue;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_scores_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "assessment_events";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: WebPushSubscription;
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          enabled?: boolean;
        } & TimestampInsert;
        Update: {
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          user_agent?: string | null;
          enabled?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_sends: {
        Row: NotificationSend;
        Insert: {
          id?: string;
          sent_by: string;
          template_key: NoticeTemplateKeyDb;
          audience_key: NoticeAudienceKeyDb;
          source_session_id?: string | null;
          audience_team_id?: string | null;
          locale: "zh-Hant" | "en" | "ja";
          title: string;
          body: string;
          url: string;
          intended_count?: number;
          subscribed_count?: number;
          skipped_count?: number;
          sent_count?: number;
          failed_count?: number;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          intended_count?: number;
          subscribed_count?: number;
          skipped_count?: number;
          sent_count?: number;
          failed_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "notification_sends_sent_by_fkey";
            columns: ["sent_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
      is_approved_guardian_for_player: {
        Args: { p_player_id: string };
        Returns: boolean;
      };
      player_id_from_storage_name: {
        Args: { object_name: string };
        Returns: string | null;
      };
      can_write_player_photo: {
        Args: { p_player_id: string };
        Returns: boolean;
      };
      can_read_player_photo: {
        Args: { p_player_id: string };
        Returns: boolean;
      };
      set_player_headshot: {
        Args: { p_player_id: string; p_photo_path: string | null };
        Returns: undefined;
      };
      set_player_id_pdf: {
        Args: { p_player_id: string; p_id_pdf_path: string | null };
        Returns: undefined;
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
      admin_set_player_memberships: {
        Args: {
          p_player_id: string;
          p_team_ids: string[];
          p_jersey_numbers: number[];
        };
        Returns: undefined;
      };
      admin_set_player_age_squad: {
        Args: {
          p_player_id: string;
          p_squad_id: string;
          p_jersey_number: number;
        };
        Returns: undefined;
      };
      admin_set_cross_squad: {
        Args: {
          p_player_id: string;
          p_team_id: string | null;
          p_jersey_number?: number | null;
        };
        Returns: undefined;
      };
      admin_set_player_competition_teams: {
        Args: {
          p_player_id: string;
          p_team_ids: string[];
          p_jersey_numbers: number[];
        };
        Returns: undefined;
      };
      computed_age_band_from_birth_date: {
        Args: {
          p_birth_date: string;
          p_as_of: string;
        };
        Returns: AgeBand;
      };
      birth_age_label_from_birth_date: {
        Args: {
          p_birth_date: string;
          p_as_of: string;
        };
        Returns: string;
      };
      age_squad_band_from_birth_date: {
        Args: {
          p_birth_date: string;
          p_as_of: string;
        };
        Returns: AgeBand;
      };
      next_higher_computed_age_band: {
        Args: { p_band: AgeBand };
        Returns: AgeBand | null;
      };
      team_age_band_allowed_for_player: {
        Args: {
          p_natural: AgeBand;
          p_team: AgeBand;
        };
        Returns: boolean;
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
      update_session_registration_parent_note: {
        Args: {
          p_registration_id: string;
          p_parent_note?: string | null;
        };
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
      admin_soft_delete_match: {
        Args: { p_session_id: string };
        Returns: string;
      };
      admin_soft_delete_session_series: {
        Args: { p_series_id: string };
        Returns: string;
      };
      submit_payment_report: {
        Args: {
          p_player_id: string;
          p_item_id: string;
          p_amount_twd: number | null;
          p_transfer_date: string;
          p_last5: string;
          p_invoice_needed?: boolean;
          p_invoice_tax_id?: string | null;
          p_invoice_title?: string | null;
          p_screenshot_path?: string | null;
        };
        Returns: string;
      };
      admin_upsert_payment_item: {
        Args: {
          p_id: string | null;
          p_kind: string;
          p_name_zh: string;
          p_name_ja: string | null;
          p_name_en: string | null;
          p_price_twd: number | null;
          p_active: boolean;
          p_sort_order?: number;
        };
        Returns: string;
      };
      director_record_cash: {
        Args: {
          p_player_id: string;
          p_item_id: string;
          p_amount_twd?: number | null;
          p_note?: string | null;
          p_invoice_needed?: boolean;
          p_invoice_tax_id?: string | null;
          p_invoice_title?: string | null;
        };
        Returns: unknown;
      };
      director_void_cash_receipt: {
        Args: { p_receipt_id: string; p_reason: string };
        Returns: undefined;
      };
      director_close_cash_day: {
        Args: { p_day: string };
        Returns: string;
      };
      director_record_deposit: {
        Args: {
          p_deposit_date: string;
          p_amount_twd: number;
          p_closing_ids: string[];
          p_note?: string | null;
          p_slip_path?: string | null;
        };
        Returns: string;
      };
      staff_reconcile_deposit: {
        Args: { p_deposit_id: string };
        Returns: undefined;
      };
      admin_create_paper_card: {
        Args: { p_player_id: string };
        Returns: string;
      };
      admin_attach_paper_card_photos: {
        Args: { p_card_id: string; p_paths: string[] };
        Returns: undefined;
      };
      admin_save_paper_card_extraction: {
        Args: {
          p_card_id: string;
          p_extracted: Record<string, unknown> | null;
          p_needs_manual: boolean;
          p_card_no?: string | null;
          p_package_credits?: number | null;
          p_squad_marks?: string[] | null;
        };
        Returns: undefined;
      };
      admin_discard_paper_card: {
        Args: { p_card_id: string };
        Returns: string[];
      };
      admin_confirm_paper_card: {
        Args: {
          p_card_id: string;
          p_card_no: string | null;
          p_package_credits: number;
          p_used_dates: string[];
          p_remaining: number;
        };
        Returns: Record<string, unknown>;
      };
      admin_purge_paper_card_photos: {
        Args: { p_card_id: string };
        Returns: undefined;
      };
      staff_record_paper_card_check: {
        Args: { p_player_id: string; p_card_remaining: number; p_note?: string | null };
        Returns: Record<string, unknown>;
      };
      admin_record_ai_job: {
        Args: {
          p_kind: string;
          p_model: string;
          p_input_ref: string | null;
          p_output: unknown;
          p_status: string;
          p_cost_usd?: number | null;
        };
        Returns: string;
      };
      admin_set_director: {
        Args: { p_user_id: string; p_enabled: boolean };
        Returns: undefined;
      };
      admin_record_invoice: {
        Args: { p_invoice_id: string; p_invoice_no: string };
        Returns: undefined;
      };
      submit_payment_claim: {
        Args: {
          p_player_id: string;
          p_package_id: string;
          p_last5: string;
        };
        Returns: string;
      };
      set_preferred_language: {
        Args: {
          p_language: "zh-Hant" | "ja" | "en";
          p_only_if_unset?: boolean;
        };
        Returns: string;
      };
      admin_set_task_status: {
        Args: {
          p_task_id: string;
          p_status: TaskStatus;
          p_snoozed_until?: string | null;
        };
        Returns: string;
      };
      admin_log_event: {
        Args: {
          p_action: string;
          p_entity_type: string;
          p_entity_id?: string | null;
          p_details?: Record<string, unknown>;
        };
        Returns: number;
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
          p_reason_category?: LeaveReasonCategory | null;
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
      checkin_preview: {
        Args: { p_token: string };
        Returns: Record<string, unknown> | null;
      };
      parent_checkin: {
        Args: { p_token: string; p_player_ids: string[]; p_session_id?: string | null };
        Returns: unknown;
      };
      staff_confirm_headcount: {
        Args: { p_session_id: string; p_headcount: number };
        Returns: unknown;
      };
      staff_remove_checkin: {
        Args: { p_session_id: string; p_player_id: string; p_reason: string };
        Returns: undefined;
      };
      admin_upsert_venue: {
        Args: { p_id: string | null; p_name: string; p_address: string | null; p_active: boolean };
        Returns: string;
      };
      admin_regenerate_venue_token: {
        Args: { p_id: string };
        Returns: undefined;
      };
      admin_set_session_venue: {
        Args: { p_session_id: string; p_venue_id: string | null; p_whole_series?: boolean };
        Returns: number;
      };
      mark_parent_notices_read: {
        Args: { p_notice_ids: string[] };
        Returns: number;
      };
      finalize_session_attendance: {
        Args: {
          p_session_id: string;
        };
        Returns: number;
      };
      mark_session_attendance: {
        Args: {
          p_session_id: string;
          p_player_id: string;
          p_status: AttendanceStatus;
        };
        Returns: string;
      };
      list_published_matches: {
        Args: Record<PropertyKey, never>;
        Returns: PublishedMatch[];
      };
      get_published_match: {
        Args: { p_session_id: string };
        Returns: PublishedMatch[];
      };
      list_published_match_roster: {
        Args: { p_session_id: string };
        Returns: PublishedMatchRosterEntry[];
      };
      match_is_publicly_visible: {
        Args: { p_session_id: string };
        Returns: boolean;
      };
      admin_create_match: {
        Args: {
          p_team_id: string;
          p_title: string;
          p_kind: SessionKind;
          p_starts_at: string;
          p_ends_at: string;
          p_location?: string | null;
          p_notes?: string | null;
          p_opponent?: string | null;
          p_side?: MatchSide;
          p_is_playoff?: boolean;
          p_is_published?: boolean;
        };
        Returns: string;
      };
      admin_upsert_match_publication: {
        Args: {
          p_session_id: string;
          p_opponent?: string | null;
          p_side: MatchSide;
          p_is_published?: boolean;
        };
        Returns: string;
      };
      admin_update_match: {
        Args: {
          p_session_id: string;
          p_title: string;
          p_starts_at: string;
          p_ends_at: string;
          p_location?: string | null;
          p_notes?: string | null;
          p_opponent?: string | null;
          p_side?: MatchSide;
          p_is_playoff?: boolean;
        };
        Returns: string;
      };
      admin_set_match_published: {
        Args: {
          p_session_id: string;
          p_is_published: boolean;
        };
        Returns: string;
      };
      admin_set_match_result: {
        Args: {
          p_session_id: string;
          p_club_score: number;
          p_opponent_score: number;
          p_result_note?: string | null;
        };
        Returns: string;
      };
      admin_cancel_match: {
        Args: { p_session_id: string };
        Returns: string;
      };
      admin_restore_match: {
        Args: { p_session_id: string };
        Returns: string;
      };
      admin_postpone_match: {
        Args: { p_session_id: string };
        Returns: string;
      };
      admin_set_match_broadcast: {
        Args: {
          p_session_id: string;
          p_live_stream_url: string | null;
          p_live_video_id: string | null;
          p_replay_url: string | null;
          p_replay_video_id: string | null;
          p_highlights_url: string | null;
          p_highlights_video_id: string | null;
          p_embed_enabled: boolean;
          p_embed_check_status: MatchEmbedCheckStatus;
          p_video_title: string | null;
          p_live_window_before_min: number | null;
        };
        Returns: string;
      };
      admin_set_match_listing: {
        Args: {
          p_session_id: string;
          p_opponent_club_id: string | null;
          p_public_venue_id: string | null;
          p_season_id: string | null;
          p_competition_id: string | null;
          p_round_no: number | null;
          p_round_label: string | null;
        };
        Returns: string;
      };
      admin_set_match_roster: {
        Args: {
          p_session_id: string;
          p_player_ids: string[];
        };
        Returns: string;
      };
      admin_create_matches: {
        Args: {
          p_team_id: string;
          p_title: string;
          p_kind: SessionKind;
          p_starts_at: string[];
          p_ends_at: string[];
          p_location?: string | null;
          p_notes?: string | null;
          p_opponent?: string | null;
          p_side?: MatchSide;
          p_is_playoff?: boolean;
          p_is_published?: boolean;
        };
        Returns: string[];
      };
      coach_can_assess_player: {
        Args: { p_player_id: string };
        Returns: boolean;
      };
      staff_can_write_player_assessment: {
        Args: { p_player_id: string };
        Returns: boolean;
      };
      can_read_player_assessment: {
        Args: { p_player_id: string };
        Returns: boolean;
      };
      create_player_assessment: {
        Args: {
          p_player_id: string;
          p_assessed_on: string;
          p_situations: AssessmentSituations;
          p_traits: AssessmentTraits;
        };
        Returns: string;
      };
      update_player_assessment: {
        Args: {
          p_id: string;
          p_assessed_on: string;
          p_situations: AssessmentSituations;
          p_traits: AssessmentTraits;
        };
        Returns: string;
      };
      delete_player_assessment: {
        Args: { p_id: string };
        Returns: string;
      };
      create_assessment_event: {
        Args: {
          p_player_id: string;
          p_assessed_at: string;
          p_note: string | null;
          p_session_id: string | null;
          p_scores: {
            dimension_kind: AssessmentDimensionKind;
            dimension_code: AssessmentTraitCode | AssessmentPhaseCode;
            score: AssessmentScoreValue;
          }[];
        };
        Returns: string;
      };
      update_assessment_event: {
        Args: {
          p_id: string;
          p_assessed_at: string;
          p_note: string | null;
          p_session_id: string | null;
          p_scores: {
            dimension_kind: AssessmentDimensionKind;
            dimension_code: AssessmentTraitCode | AssessmentPhaseCode;
            score: AssessmentScoreValue;
          }[];
        };
        Returns: string;
      };
      delete_assessment_event: {
        Args: { p_id: string };
        Returns: string;
      };
    };
    Enums: {
      app_role: AppRole;
      age_band: AgeBand;
      team_kind: TeamKind;
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
      match_side: MatchSide;
      match_public_status: MatchPublicStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
