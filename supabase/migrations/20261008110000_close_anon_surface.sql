-- Close what anon (and the Data API) can reach by default (Futuro site spec
-- v4, architecture rule 4).
-- Staging only. Do not run against production.
--
-- Supabase cloud exposes new objects in `public` to anon/authenticated unless
-- the project turns "Automatically expose new tables" off, and Postgres lets
-- PUBLIC execute every new function. Two holes came from that:
--
-- 1. The views age_squads and competition_teams (Stage ST) were owned by
--    postgres without security_invoker, so they bypassed RLS on teams. With
--    the default grants, anon could read AND update/insert/delete teams
--    through them (PATCH /rest/v1/competition_teams with the public anon key),
--    and any signed-in user could read every team. The app does not use these
--    views. They now run with the caller's rights (teams RLS applies) and only
--    authenticated keeps SELECT.
-- 2. Four helper functions were never revoked from PUBLIC, so anon could call
--    them over RPC. Two are SECURITY DEFINER: ensure_player_session_balance
--    (anon could insert a zero balance row for any player id) and
--    player_active_on_session_team (anon could probe team membership). Callers
--    inside the app are SECURITY DEFINER RPCs, which run as the owner, so only
--    anon loses access; authenticated keeps EXECUTE as before.
-- 3. The identity sequence behind audit_log.id was granted to anon the same
--    way. Only anon loses it.
--
-- supabase/anon_surface_verification.sql asserts the resulting allow list.

alter view public.age_squads set (security_invoker = true);
alter view public.competition_teams set (security_invoker = true);

revoke all on public.age_squads from public, anon, authenticated;
revoke all on public.competition_teams from public, anon, authenticated;
grant select on public.age_squads to authenticated;
grant select on public.competition_teams to authenticated;

revoke all on function public.ensure_player_session_balance(uuid) from public, anon;
revoke all on function public.player_active_on_session_team(uuid, uuid) from public, anon;
revoke all on function public.club_session_date(timestamptz) from public, anon;
revoke all on function public.session_credit_ledger_immutable() from public, anon;

grant execute on function public.ensure_player_session_balance(uuid) to authenticated;
grant execute on function public.player_active_on_session_team(uuid, uuid) to authenticated;
grant execute on function public.club_session_date(timestamptz) to authenticated;
grant execute on function public.session_credit_ledger_immutable() to authenticated;

revoke all on sequence public.audit_log_id_seq from public, anon;
