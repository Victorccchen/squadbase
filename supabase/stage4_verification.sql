-- Optional Stage 4 checks. Staging only. Do not run against production.
-- Substitute real UUIDs before the RLS block. The unique-index block rolls back.

begin;

-- Re-register after cancel: unique index only occupies status = registered.
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

  insert into public.training_sessions (team_id, starts_at, ends_at, status)
  values (team_id, now() + interval '1 day', now() + interval '1 day 90 minutes', 'active')
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
    raise exception 'T4 re-register after cancel failed';
  end if;

  raise notice 'unique-index re-register after cancel ok';
end
$$;

rollback;

-- RLS / RPC notes (run as the parent JWT in SQL Editor, not as postgres):
-- T4-3 / T4-5: register_player_for_session as a parent without an approved
--   guardian_player_links row must fail (not an approved guardian).
-- T4-6: list of active sessions via PostgREST must not return status=inactive.
-- Admin SELECT of session_registrations returns the roster; a parent SELECT
--   without is_approved_guardian_for_player must not dump other families.
