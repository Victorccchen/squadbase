-- Parent cancel lock: cannot cancel within 24 hours of session start.
-- Staging SQL Editor only. Do not run against production.
--
-- Product: parents may cancel a registration only when
-- training_sessions.starts_at - now() > 24 hours (timestamptz; 24h is
-- absolute, so Asia/Taipei wall time is implied by the stored instant).
-- After cancel, the pair may re-register (existing unique open-pair index
-- on registered rows only). Does not change Stage 4B debit/payment rules
-- or RLS. Safe to re-run (create or replace).

create or replace function public.cancel_session_registration(p_registration_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_player uuid;
  session_starts timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select r.player_id, s.starts_at
    into target_player, session_starts
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

  if session_starts - now() <= interval '24 hours' then
    raise exception 'cannot cancel within 24 hours of start' using errcode = 'P0001';
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
  'Parent or admin cancels a registered row. Blocked when now is within 24 hours before training_sessions.starts_at. After cancel, the same pair may register again.';

revoke all on function public.cancel_session_registration(uuid) from public, anon;
grant execute on function public.cancel_session_registration(uuid) to authenticated;
