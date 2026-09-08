-- Stage ST privilege follow-up (staging only). Do not run against production.
-- Idempotent repair after 20260910000000_stage_st_age_squads_competition_teams.sql.
-- Does not change RLS policies. Safe to re-run.
--
-- Paste this file's CONTENTS in the staging SQL Editor (not a path string).

grant usage on type public.team_kind to authenticated;

revoke all on function public.birth_age_label_from_completed_age(integer) from public, anon;
revoke all on function public.age_squad_band_from_completed_age(integer) from public, anon;
revoke all on function public.birth_age_label_from_birth_date(date, date) from public, anon;
revoke all on function public.age_squad_band_from_birth_date(date, date) from public, anon;
revoke all on function public.layer_key_from_age_band(public.age_band) from public, anon;
revoke all on function public.default_eligible_birth_ages(text) from public, anon;
revoke all on function public.session_team_kind_allowed(public.session_kind, public.team_kind) from public, anon;
revoke all on function public.enforce_session_unit_kind() from public, anon, authenticated;
revoke all on function public.enforce_team_membership_rules() from public, anon, authenticated;
revoke all on function public.admin_set_player_age_squad(uuid, uuid, integer) from public, anon;
revoke all on function public.admin_set_player_competition_teams(uuid, uuid[], integer[]) from public, anon;
revoke all on function public.admin_set_player_memberships(uuid, uuid[], integer[]) from public, anon;

grant execute on function public.birth_age_label_from_completed_age(integer) to authenticated;
grant execute on function public.age_squad_band_from_completed_age(integer) to authenticated;
grant execute on function public.birth_age_label_from_birth_date(date, date) to authenticated;
grant execute on function public.age_squad_band_from_birth_date(date, date) to authenticated;
grant execute on function public.layer_key_from_age_band(public.age_band) to authenticated;
grant execute on function public.default_eligible_birth_ages(text) to authenticated;
grant execute on function public.session_team_kind_allowed(public.session_kind, public.team_kind) to authenticated;
grant execute on function public.admin_set_player_age_squad(uuid, uuid, integer) to authenticated;
grant execute on function public.admin_set_player_competition_teams(uuid, uuid[], integer[]) to authenticated;
grant execute on function public.admin_set_player_memberships(uuid, uuid[], integer[]) to authenticated;
grant execute on function public.computed_age_band_from_birth_date(date, date) to authenticated;
grant execute on function public.player_team_catalog_band(uuid) to authenticated;

grant select on public.age_squads to authenticated;
grant select on public.competition_teams to authenticated;
