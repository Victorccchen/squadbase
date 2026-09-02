-- Stage 3 follow-up (staging only). Do not run against production.
-- Idempotent privilege repair: GRANT-level failures after Stage 3 SQL
-- ("permission denied for table guardian_player_links",
--  "permission denied for function list_active_teams_for_link").
-- Does not change RLS policies. Safe to re-run.

revoke all on table public.guardian_player_links from public, anon;
grant select, insert, update, delete on table public.guardian_player_links to authenticated;

revoke all on table public.teams from public, anon;
grant select, insert, update, delete on table public.teams to authenticated;

revoke all on function public.list_active_teams_for_link() from public, anon;
revoke all on function public.search_player_for_guardian_link(uuid, integer, date, text) from public, anon;
revoke all on function public.admin_review_guardian_link(uuid, public.link_status, text) from public, anon;
revoke all on function public.is_approved_guardian_for_player(uuid) from public, anon;
revoke all on function public.guardian_can_read_team(uuid) from public, anon;

grant execute on function public.list_active_teams_for_link() to authenticated;
grant execute on function public.search_player_for_guardian_link(uuid, integer, date, text) to authenticated;
grant execute on function public.admin_review_guardian_link(uuid, public.link_status, text) to authenticated;
grant execute on function public.is_approved_guardian_for_player(uuid) to authenticated;
grant execute on function public.guardian_can_read_team(uuid) to authenticated;
