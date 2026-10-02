import type { CheckinResult } from "@/lib/checkin/model";
import type { OrgErrorKey } from "@/lib/org/errors";

export type CheckinActionState = {
  errorKey: OrgErrorKey | null;
  results: CheckinResult[];
};

export const INITIAL_CHECKIN_STATE: CheckinActionState = { errorKey: null, results: [] };
