-- Multi-team membership follow-up (staging only). Do not run against production.
-- Idempotent privilege repair after 20260909100000_multi_team_membership_rules.sql.
-- Does not change RLS policies. Safe to re-run.
--
-- Paste this file's CONTENTS in the staging SQL Editor (not a path string).

revoke all on function public.season_start_on(date) from public, anon;
revoke all on function public.computed_age_band_from_birth_date(date, date) from public, anon;
revoke all on function public.age_band_ladder_rank(public.age_band) from public, anon;
revoke all on function public.next_higher_computed_age_band(public.age_band) from public, anon;
revoke all on function public.team_age_band_allowed_for_player(public.age_band, public.age_band) from public, anon;
revoke all on function public.club_today() from public, anon;
revoke all on function public.enforce_team_membership_rules() from public, anon, authenticated;
revoke all on function public.admin_set_player_memberships(uuid, uuid[], integer[]) from public, anon;

grant execute on function public.season_start_on(date) to authenticated;
grant execute on function public.computed_age_band_from_birth_date(date, date) to authenticated;
grant execute on function public.age_band_ladder_rank(public.age_band) to authenticated;
grant execute on function public.next_higher_computed_age_band(public.age_band) to authenticated;
grant execute on function public.team_age_band_allowed_for_player(public.age_band, public.age_band) to authenticated;
grant execute on function public.club_today() to authenticated;
grant execute on function public.admin_set_player_memberships(uuid, uuid[], integer[]) to authenticated;
