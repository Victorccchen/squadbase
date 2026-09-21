-- Match-specific admin soft-delete (staging only). Do not run against production.
-- Paste this file's CONTENTS in the staging SQL Editor (not a path string).
-- Idempotent. Safe to re-run.
--
-- Why: admin match delete reused admin_soft_delete_session and could return
-- success even when training_sessions.deleted_at did not change (0-row UPDATE
-- is not an error). Cancel stays a different action (public_status=cancelled).
-- This RPC sets deleted_at, unpublishes, and errors if no row was updated.
-- Roster, registrations, and Q&A are not deleted.

create or replace function public.admin_soft_delete_session(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (select 1 from public.training_sessions where id = p_session_id) then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  update public.training_sessions
  set
    deleted_at = coalesce(deleted_at, now()),
    updated_by = auth.uid()
  where id = p_session_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  return p_session_id;
end;
$$;

create or replace function public.admin_soft_delete_match(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind public.session_kind;
  v_updated integer;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select s.kind into v_kind
  from public.training_sessions s
  join public.match_publications p on p.session_id = s.id
  where s.id = p_session_id;

  if v_kind is null then
    raise exception 'match not found' using errcode = 'P0002';
  end if;

  if not public.is_match_session_kind(v_kind) then
    raise exception 'match kind must be cup, league, or friendly' using errcode = '22023';
  end if;

  update public.training_sessions
  set
    deleted_at = coalesce(deleted_at, now()),
    updated_by = auth.uid()
  where id = p_session_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'match not found' using errcode = 'P0002';
  end if;

  -- Hide from the public list without cancelling (cancel remains a separate action).
  update public.match_publications
  set
    is_published = false,
    updated_by = auth.uid()
  where session_id = p_session_id;

  return p_session_id;
end;
$$;

comment on function public.admin_soft_delete_session(uuid) is
  'Admin-only. Sets deleted_at. Errors if the session row was not updated. Does not remove registrations or Q&A.';
comment on function public.admin_soft_delete_match(uuid) is
  'Admin-only one-match soft-delete. Sets training_sessions.deleted_at and unpublishes. Does not cancel. Roster/registrations/Q&A stay. Idempotent when already deleted.';

revoke all on function public.admin_soft_delete_session(uuid) from public, anon;
revoke all on function public.admin_soft_delete_match(uuid) from public, anon;

grant execute on function public.admin_soft_delete_session(uuid) to authenticated;
grant execute on function public.admin_soft_delete_match(uuid) to authenticated;
