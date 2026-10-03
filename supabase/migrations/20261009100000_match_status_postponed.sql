-- Futuro site phase 1a (spec v4 §5.2, §8.1-2): a match can be postponed.
-- Staging only. Do not run against production.
--
-- A new enum value cannot be used in the same transaction that adds it, so
-- this file only adds the value. 20261009110000_site_public_api_v1.sql uses it.
-- Same pattern as 20261006100000_director_role.sql.

alter type public.match_public_status add value if not exists 'postponed' after 'scheduled';

comment on type public.match_public_status is
  'scheduled = upcoming; postponed = date to be confirmed (no live window, no score); completed = score entered; cancelled = will not be played.';
