-- Phase 1 PR-08b (part 1): youth director role (D4, D13).
-- A new enum value cannot be used in the transaction that adds it, so it has
-- its own migration; 20261006110000 uses it. Staging only.

alter type public.app_role add value if not exists 'director';

comment on type public.app_role is
  'parent, coach, admin, player, director (youth director: collects cash at the field, closes the day, records deposits).';
