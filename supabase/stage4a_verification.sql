-- Optional Stage 4A checks. Staging only. Do not run against production.
-- Requires Stage 4A migration. Substitute nothing for the unique-index block.
-- The unique-index block rolls back. RPC checks need an admin JWT in SQL Editor.

begin;

do $$
declare
  team_id uuid;
  session_id uuid;
  player_id uuid;
  guardian_id uuid;
  first_id uuid;
  second_id uuid;
begin
  select id into team_id from public.teams where status = 'active' limit 1;
  select id into player_id from public.players limit 1;
  select id into guardian_id from public.profiles limit 1;

  if team_id is null or player_id is null or guardian_id is null then
    raise notice 'skip unique-index block: need at least one team, player, and profile';
    return;
  end if;

  insert into public.training_sessions (
    team_id, title, kind, starts_at, ends_at, status
  )
  values (
    team_id,
    'Stage 4A verification',
    'special',
    now() + interval '1 day',
    now() + interval '1 day 90 minutes',
    'active'
  )
  returning id into session_id;

  insert into public.session_registrations (
    session_id, player_id, guardian_user_id, status
  )
  values (session_id, player_id, guardian_id, 'registered')
  returning id into first_id;

  update public.session_registrations
  set status = 'cancelled'
  where id = first_id;

  insert into public.session_registrations (
    session_id, player_id, guardian_user_id, status
  )
  values (session_id, player_id, guardian_id, 'registered')
  returning id into second_id;

  if second_id is null then
    raise exception 'T4A re-register after cancel failed';
  end if;

  update public.training_sessions
  set deleted_at = now()
  where id = session_id;

  if not exists (
    select 1 from public.session_registrations where id = second_id
  ) then
    raise exception 'T4A soft-delete must keep registrations';
  end if;

  raise notice 'unique-index re-register after cancel + soft-delete keeps rows ok';
end
$$;

rollback;

-- RLS / RPC notes (run as the relevant JWT in SQL Editor, not as postgres):
-- T4A-6: after admin_soft_delete_session, parent PostgREST list of open
--   sessions must not return that id; registrations on it remain selectable.
-- T4A-7: admin_create_session_series / admin_soft_delete_session as a parent
--   JWT must fail (not authorized).
-- League playoff: update is_playoff = true is allowed only when kind = league
--   (training_sessions_playoff_league_only).
