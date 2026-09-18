/**
 * Preview/confirm action states for Stage L. Kept out of `"use server"` files
 * so Next.js does not treat these objects as Server Actions.
 */

import type { OrgErrorKey } from "./errors.ts";

export type TorneopalPreviewState = {
  ok: boolean;
  errorKey: OrgErrorKey | null;
  previewJson: string | null;
  attempted: boolean;
};

export const INITIAL_TORNEOPAL_PREVIEW_STATE: TorneopalPreviewState = {
  ok: false,
  errorKey: null,
  previewJson: null,
  attempted: false,
};

export type TorneopalConfirmRow = {
  line: number;
  ok: boolean;
  skipped: boolean;
  errorKeys: OrgErrorKey[];
  createdId: string | null;
};

export type TorneopalConfirmState = {
  ok: boolean;
  errorKey: OrgErrorKey | null;
  created: TorneopalConfirmRow[];
  skipped: TorneopalConfirmRow[];
  failed: TorneopalConfirmRow[];
  attempted: boolean;
};

export const INITIAL_TORNEOPAL_CONFIRM_STATE: TorneopalConfirmState = {
  ok: false,
  errorKey: null,
  created: [],
  skipped: [],
  failed: [],
  attempted: false,
};
