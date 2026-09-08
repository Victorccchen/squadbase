export type OrgErrorKey =
  | "forbidden"
  | "notConfigured"
  | "invalidName"
  | "missingCjkName"
  | "invalidAgeBand"
  | "invalidStatus"
  | "invalidBirthDate"
  | "futureBirthDate"
  | "invalidJersey"
  | "missingTeam"
  | "missingAgeSquad"
  | "jerseyTaken"
  | "tooManyActiveMemberships"
  | "membershipBandNotAllowed"
  | "membershipBirthNotEligible"
  | "membershipLayerConflict"
  | "continuesTrainingRequired"
  | "invalidTeamKind"
  | "invalidLayerKey"
  | "missingEligibleBirthAges"
  | "duplicateMembershipTeam"
  | "profileRequired"
  | "incompleteSearch"
  | "searchNameTooShort"
  | "noPlayerMatch"
  | "playerRequired"
  | "invalidRelation"
  | "invalidDecision"
  | "linkAlreadyOpen"
  | "cannotCancelLink"
  | "cannotRevokeApproved"
  | "cannotRevokeLink"
  | "teamNotFound"
  | "teamHasActiveMemberships"
  | "teamHasMemberships"
  | "teamHasCoachAssignments"
  | "sessionNotFound"
  | "sessionNotActive"
  | "notApprovedGuardian"
  | "playerNotOnSessionTeam"
  | "alreadyRegistered"
  | "cannotCancelRegistration"
  | "cannotCancelWithin24h"
  | "cannotSwitchSession"
  | "invalidSessionTime"
  | "endsBeforeStart"
  | "invalidDuration"
  | "invalidLocation"
  | "messageBodyRequired"
  | "missingPlayer"
  | "missingSession"
  | "missingTitle"
  | "invalidSessionKind"
  | "recurrenceMutex"
  | "recurrenceBoundRequired"
  | "invalidWeekCount"
  | "invalidUntilDate"
  | "untilBeforeStart"
  | "tooManyOccurrences"
  | "weekdayRequired"
  | "invalidWeekdays"
  | "invalidLast5"
  | "packageNotFound"
  | "packageBandMismatch"
  | "creditsNotApplicable"
  | "pendingClaimExists"
  | "claimNotFound"
  | "insufficientCredits"
  | "reasonRequired"
  | "invalidCreditAmount"
  | "invalidPrice"
  | "adjustWouldBeNegative"
  | "pendingLeaveExists"
  | "leaveNotFound"
  | "invalidPackageBand"
  | "invalidOpponent"
  | "invalidMatchSide"
  | "invalidMatchScore"
  | "matchKindRequired"
  | "sessionKindUseMatches"
  | "matchNotFound"
  | "matchCancelled"
  | "matchRosterPlayerInvalid"
  | "tooManyMatches"
  | "matchKickoffRequired"
  | "invalidScore"
  | "noteTooLong"
  | "invalidAssessedOn"
  | "futureAssessedOn"
  | "assessmentNotFound"
  | "partialTeamCreates"
  | "duplicatePlayer"
  | "duplicateInFile"
  | "unknownProfilePhone"
  | "coachAlreadyLinked"
  | "ambiguousTeamName"
  | "importEmpty"
  | "importTooLarge"
  | "importInvalidFile"
  | "importNoValidRows"
  | "importHeaderInvalid"
  | "blockedUrl"
  | "urlFetchFailed"
  | "urlTimeout"
  | "missingProfile"
  | "generic";

export type TeamCreateRowResult = {
  teamId: string;
  ok: boolean;
  errorKey: OrgErrorKey | null;
  createdId?: string | null;
};

export type OrgActionState = {
  ok: boolean;
  errorKey: OrgErrorKey | null;
  teamResults?: TeamCreateRowResult[];
};

export const INITIAL_ORG_ACTION_STATE: OrgActionState = {
  ok: false,
  errorKey: null,
};

export type BulkRsvpRowResult = {
  sessionId: string;
  startsAt: string;
  ok: boolean;
  errorKey: OrgErrorKey | null;
};

export type BulkRsvpState = {
  ok: boolean;
  errorKey: OrgErrorKey | null;
  results: BulkRsvpRowResult[];
  attempted: boolean;
};

export const INITIAL_BULK_RSVP_STATE: BulkRsvpState = {
  ok: false,
  errorKey: null,
  results: [],
  attempted: false,
};

export type PlayerSearchMatchState = {
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

export type SearchPlayersState = {
  ok: boolean;
  errorKey: OrgErrorKey | null;
  matches: PlayerSearchMatchState[];
  searched: boolean;
};

export const INITIAL_SEARCH_PLAYERS_STATE: SearchPlayersState = {
  ok: false,
  errorKey: null,
  matches: [],
  searched: false,
};
