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
  | "jerseyTaken"
  | "profileRequired"
  | "generic";

export type OrgActionState = {
  ok: boolean;
  errorKey: OrgErrorKey | null;
};

export const INITIAL_ORG_ACTION_STATE: OrgActionState = {
  ok: false,
  errorKey: null,
};
