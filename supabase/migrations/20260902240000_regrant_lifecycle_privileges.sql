-- Lifecycle privilege repair (staging only). Do not run against production.
-- Idempotent GRANT repair for:
--   "permission denied for table teams"
-- and the membership / assignment tables the admin teams list also reads.
-- Does not change RLS policies. Safe to re-run.
--
-- Paste this file in the staging SQL Editor if admins still see GRANT denials
-- after 20260902220000_lifecycle_revoke_and_team_delete.sql.

revoke all on table public.teams from public, anon;
grant select, insert, update, delete on table public.teams to authenticated;

revoke all on table public.team_memberships from public, anon;
grant select, insert, update, delete on table public.team_memberships to authenticated;

revoke all on table public.coach_team_assignments from public, anon;
grant select, insert, update, delete on table public.coach_team_assignments to authenticated;

revoke all on table public.players from public, anon;
grant select, insert, update, delete on table public.players to authenticated;

revoke all on table public.guardian_player_links from public, anon;
grant select, insert, update, delete on table public.guardian_player_links to authenticated;

-- Re-grant lifecycle RPCs when they already exist (skip if step 7 is not applied yet).
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'admin_delete_team',
        'admin_revoke_guardian_link',
        'list_active_teams_for_link'
      )
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end
$$;
