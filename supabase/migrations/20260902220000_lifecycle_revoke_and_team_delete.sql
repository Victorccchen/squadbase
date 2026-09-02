-- Lifecycle follow-up (staging only). Do not run against production.
-- Step 2 of 2: guardian revoke/cancel + admin team deactivate/hard-delete.
--
-- Apply AFTER 20260902200000_link_status_add_revoked.sql has committed.
-- Written to be re-runnable (drop policy/trigger/constraint if exists,
-- create or replace function).
--
-- Product:
--   * Parent may set own pending link → revoked (withdraw). Cannot revoke approved.
--   * Admin may revoke approved links (optional note) via security-definer RPC.
--   * revoked/rejected do not occupy the open-pair unique index; the same
--     (guardian, player) pair may apply again.
--   * is_approved_guardian_for_player stays status = approved only.
--   * Admin may deactivate/reactivate teams (org_status). list_active_teams_for_link
--     already returns active rows only.
--   * Admin may hard-delete a team only when no memberships remain
--     (active or inactive) and no coach_team_assignments remain.
--     Players are never cascade-deleted.

comment on type public.link_status is
  'Admin approval state. pending/approved occupy the open-pair unique index. rejected/revoked are history; the pair may apply again. Only approved guardians may read linked player rows.';

comment on table public.guardian_player_links is
  'Parent requests to link to an existing player. Admins approve, reject, or revoke approved links. Parents may withdraw (revoke) their own pending request. Pending/rejected/revoked must not read player PII via table SELECT.';

-- Open pair: only pending and approved block a duplicate insert.
drop index if exists public.guardian_player_links_open_pair_idx;
create unique index guardian_player_links_open_pair_idx
  on public.guardian_player_links (guardian_user_id, player_id)
  where status in ('pending', 'approved');

-- revoked: parent withdraw keeps review columns null; admin revoke sets them.
alter table public.guardian_player_links
  drop constraint if exists guardian_player_links_review_fields_match_status;

alter table public.guardian_player_links
  add constraint guardian_player_links_review_fields_match_status check (
    (
      status = 'pending'
      and reviewed_by is null
      and reviewed_at is null
    )
    or (
      status in ('approved', 'rejected')
      and reviewed_by is not null
      and reviewed_at is not null
    )
    or (
      status = 'revoked'
    )
  );

create or replace function public.admin_revoke_guardian_link(
  p_link_id uuid,
  p_admin_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.guardian_player_links
  set
    status = 'revoked',
    admin_note = nullif(btrim(coalesce(p_admin_note, '')), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_by = auth.uid()
  where id = p_link_id
    and status = 'approved';

  if not found then
    raise exception 'link not found or not approved' using errcode = 'P0002';
  end if;

  return p_link_id;
end;
$$;

comment on function public.admin_revoke_guardian_link(uuid, text) is
  'Admin-only. Soft-revokes an approved guardian_player_links row. After this, is_approved_guardian_for_player is false for that pair.';

-- Parents may update only their own pending row, and only to revoked,
-- without writing review/admin columns. Identity fields are locked by trigger.
drop policy if exists guardian_player_links_update_own_pending_to_revoked
  on public.guardian_player_links;
create policy guardian_player_links_update_own_pending_to_revoked
  on public.guardian_player_links
  for update
  to authenticated
  using (
    guardian_user_id = auth.uid()
    and status = 'pending'
  )
  with check (
    guardian_user_id = auth.uid()
    and status = 'revoked'
    and reviewed_by is null
    and reviewed_at is null
    and admin_note is null
  );

create or replace function public.guardian_player_links_restrict_parent_update()
returns trigger
language plpgsql
as $$
begin
  -- SQL Editor / service role: auth.uid() is null. Allow.
  if auth.uid() is null then
    return new;
  end if;

  if public.has_role('admin') then
    return new;
  end if;

  if old.status is distinct from 'pending'
     or new.status is distinct from 'revoked'
     or old.guardian_user_id is distinct from new.guardian_user_id
     or old.player_id is distinct from new.player_id
     or old.relation is distinct from new.relation
     or old.parent_note is distinct from new.parent_note
     or old.created_by is distinct from new.created_by
     or new.reviewed_by is not null
     or new.reviewed_at is not null
     or new.admin_note is not null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guardian_player_links_restrict_parent_update
  on public.guardian_player_links;
create trigger guardian_player_links_restrict_parent_update
  before update on public.guardian_player_links
  for each row
  execute function public.guardian_player_links_restrict_parent_update();

revoke all on function public.guardian_player_links_restrict_parent_update() from public, anon;
grant execute on function public.guardian_player_links_restrict_parent_update() to authenticated;

create or replace function public.admin_delete_team(p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  active_memberships integer;
  any_memberships integer;
  coach_assignments integer;
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

  select count(*) into any_memberships
  from public.team_memberships
  where team_id = p_team_id;

  if any_memberships > 0 then
    raise exception
      'team has memberships; remove remaining membership rows before deleting, or deactivate the team instead'
      using errcode = 'P0001';
  end if;

  select count(*) into coach_assignments
  from public.coach_team_assignments
  where team_id = p_team_id;

  if coach_assignments > 0 then
    raise exception
      'team has coach assignments; unassign coaches first, or deactivate the team instead'
      using errcode = 'P0001';
  end if;

  delete from public.teams where id = p_team_id;

  if not found then
    raise exception 'team not found' using errcode = 'P0002';
  end if;

  return p_team_id;
end;
$$;

comment on function public.admin_delete_team(uuid) is
  'Admin-only hard delete. Refuses if any team_memberships or coach_team_assignments remain. Does not delete players.';

revoke all on function public.admin_revoke_guardian_link(uuid, text) from public, anon;
revoke all on function public.admin_delete_team(uuid) from public, anon;

grant execute on function public.admin_revoke_guardian_link(uuid, text) to authenticated;
grant execute on function public.admin_delete_team(uuid) to authenticated;

-- Table privileges already granted in Stage 3; re-assert for this follow-up.
revoke all on table public.guardian_player_links from public, anon;
grant select, insert, update, delete on table public.guardian_player_links to authenticated;

revoke all on table public.teams from public, anon;
grant select, insert, update, delete on table public.teams to authenticated;
