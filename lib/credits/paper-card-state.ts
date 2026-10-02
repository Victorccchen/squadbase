import type { OrgErrorKey } from "@/lib/org/errors";

export type PaperCheckState = {
  errorKey: OrgErrorKey | null;
  cardRemaining: number | null;
  systemRemaining: number | null;
  matches: boolean | null;
};

export const INITIAL_PAPER_CHECK_STATE: PaperCheckState = {
  errorKey: null,
  cardRemaining: null,
  systemRemaining: null,
  matches: null,
};
