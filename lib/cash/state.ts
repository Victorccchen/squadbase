import type { OrgErrorKey } from "@/lib/org/errors";

export type RecordCashState = {
  errorKey: OrgErrorKey | null;
  receiptNo: string | null;
  amountTwd: number | null;
  creditsAvailable: number | null;
};

export const INITIAL_RECORD_CASH_STATE: RecordCashState = {
  errorKey: null,
  receiptNo: null,
  amountTwd: null,
  creditsAvailable: null,
};
