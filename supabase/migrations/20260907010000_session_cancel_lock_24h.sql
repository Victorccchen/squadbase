-- Guardian cancel lock: parents cannot cancel within 24 hours of starts_at.
-- Admins remain exempt. Staging SQL Editor only. Do not run against production.
-- CREATE OR REPLACE is idempotent if staging already applied this function body.
-- Also adds update_session_registration_parent_note for the parent detail note field
-- (RLS only allows guardians to update a registration into status = cancelled).

create or replace function public.cancel_session_registration(p_registration_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_player uuid;
  session_starts_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select r.player_id, s.starts_at
    into target_player, session_starts_at
  from public.session_registrations r
  join public.training_sessions s on s.id = r.session_id
  where r.id = p_registration_id
    and r.status = 'registered';

  if target_player is null then
    raise exception 'registration not found' using errcode = 'P0002';
  end if;

  if not public.is_approved_guardian_for_player(target_player)
     and not public.has_role('admin') then
    raise exception 'cannot cancel registration' using errcode = '42501';
  end if;

  if not public.has_role('admin')
     and session_starts_at <= now() + interval '24 hours' then
    raise exception 'cannot cancel within 24 hours of session start' using errcode = 'P0001';
  end if;

  update public.session_registrations
  set
    status = 'cancelled',
    updated_by = auth.uid()
  where id = p_registration_id
    and status = 'registered';

  if not found then
    raise exception 'cannot cancel registration' using errcode = 'P0001';
  end if;

  return p_registration_id;
end;
$$;

comment on function public.cancel_session_registration(uuid) is
  'Approved guardian (or admin) cancels an open registration. Guardians cannot cancel within 24 hours of starts_at; admins may. History row stays; the pair may re-register.';

create or replace function public.update_session_registration_parent_note(
  p_registration_id uuid,
  p_parent_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_player uuid;
  note text;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select player_id into target_player
  from public.session_registrations
  where id = p_registration_id
    and status = 'registered';

  if target_player is null then
    raise exception 'registration not found' using errcode = 'P0002';
  end if;

  if not public.is_approved_guardian_for_player(target_player)
     and not public.has_role('admin') then
    raise exception 'not an approved guardian for this player' using errcode = '42501';
  end if;

  note := nullif(btrim(coalesce(p_parent_note, '')), '');
  if note is not null and char_length(note) > 1000 then
    raise exception 'parent note too long' using errcode = '22023';
  end if;

  update public.session_registrations
  set
    parent_note = note,
    updated_by = auth.uid()
  where id = p_registration_id
    and status = 'registered';

  if not found then
    raise exception 'registration not found' using errcode = 'P0002';
  end if;

  return p_registration_id;
end;
$$;

comment on function public.update_session_registration_parent_note(uuid, text) is
  'Approved guardian (or admin) sets parent_note on an open registration. One-way to the club.';

revoke all on function public.cancel_session_registration(uuid) from public, anon;
revoke all on function public.update_session_registration_parent_note(uuid, text) from public, anon;

grant execute on function public.cancel_session_registration(uuid) to authenticated;
grant execute on function public.update_session_registration_parent_note(uuid, text) to authenticated;
