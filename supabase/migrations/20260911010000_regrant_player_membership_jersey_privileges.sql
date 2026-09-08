-- Privilege follow-up after 20260911000000_player_membership_jersey_self_update.sql
-- (staging only). Do not run against production.
-- Idempotent. Does not change RLS policies. Safe to re-run.
--
-- Paste this file's CONTENTS in the staging SQL Editor (not a path string).

revoke all on function public.enforce_team_membership_rules() from public, anon, authenticated;
revoke all on function public.admin_set_player_age_squad(uuid, uuid, integer) from public, anon;
revoke all on function public.admin_set_player_competition_teams(uuid, uuid[], integer[]) from public, anon;
revoke all on function public.admin_set_player_memberships(uuid, uuid[], integer[]) from public, anon;

grant execute on function public.admin_set_player_age_squad(uuid, uuid, integer) to authenticated;
grant execute on function public.admin_set_player_competition_teams(uuid, uuid[], integer[]) to authenticated;
grant execute on function public.admin_set_player_memberships(uuid, uuid[], integer[]) to authenticated;
