-- Staging only. Do not run against production.
-- Replace admin_delete_team: hard-delete is allowed when there are no ACTIVE
-- team_memberships. Inactive/ended memberships and coach assignments are
-- removed in the same transaction. Players are never deleted.
-- Idempotent (create or replace). Safe to re-run.
--
-- Paste after 20260902200000 (enum) if that is not applied yet; this file
-- does not add enum values. Also re-asserts table GRANTs used by the admin list.

create or replace function public.admin_delete_team(p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  active_memberships integer;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (select 1 from public.teams where id = p_team_id) then
    raise exception 'team not found' using errcode = 'P0002';
  end if;

  select count(*) into active_memberships
  from public.team_memberships
  where team_id = p_team_id
    and status = 'active';

  if active_memberships > 0 then
    raise exception
      'team has active memberships; end or inactivate memberships first, or deactivate the team instead'
      using errcode = 'P0001';
  end if;

  delete from public.team_memberships
  where team_id = p_team_id
    and status is distinct from 'active';

  delete from public.coach_team_assignments
  where team_id = p_team_id;

  delete from public.teams
  where id = p_team_id;

  if not found then
    raise exception 'team not found' using errcode = 'P0002';
  end if;

  return p_team_id;
end;
$$;

comment on function public.admin_delete_team(uuid) is
  'Admin-only hard delete. Blocks only while active team_memberships exist. Removes inactive memberships and coach assignments in the same transaction. Does not delete players.';

revoke all on function public.admin_delete_team(uuid) from public, anon;
grant execute on function public.admin_delete_team(uuid) to authenticated;

revoke all on table public.teams from public, anon;
grant select, insert, update, delete on table public.teams to authenticated;

revoke all on table public.team_memberships from public, anon;
grant select, insert, update, delete on table public.team_memberships to authenticated;

revoke all on table public.coach_team_assignments from public, anon;
grant select, insert, update, delete on table public.coach_team_assignments to authenticated;
