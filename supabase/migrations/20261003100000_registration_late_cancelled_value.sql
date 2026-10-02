-- Phase 1 PR-06 (part 1): registration status for a late cancel (D2-1).
-- A new enum value cannot be used in the transaction that adds it, so it has
-- its own migration; 20261003110000 uses it. Staging only.

alter type public.session_registration_status add value if not exists 'late_cancelled';

comment on type public.session_registration_status is
  'registered (open signup), cancelled (history), late_cancelled (special/match cancelled by the parent within 24 hours of start; counts as a no-show unless leave is approved).';
