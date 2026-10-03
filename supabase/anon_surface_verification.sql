-- Anon surface verification (Futuro site spec v4, architecture rule 4).
-- Does not leave rows. Do not run on production until it has its own run.
-- Paste this file's CONTENTS in the staging SQL Editor (not a path string).
--
-- Anything the anon role can reach is public on the internet through the
-- Data API and the published anon key. This script fails if that set grows
-- beyond the allow list below. When a new public RPC is added on purpose,
-- add it here in the same PR.
--
-- ANON-1: anon has no privilege on any table, view or sequence in public.
-- ANON-2: anon can execute only the allow-listed functions in public.
-- ANON-3: authenticated cannot write through the age_squads /
--         competition_teams views, and the views apply the caller's RLS.
-- ANON-4: an anon update through competition_teams is refused.

begin;

do $$
declare
  v_allowed_functions text[] := array[
    'get_published_match(p_session_id uuid)',
    'list_published_match_roster(p_session_id uuid)',
    'list_published_matches()',
    'site_api_version()',
    'site_get_match(p_id uuid)',
    'site_get_standings(p_season_id uuid, p_competition_id uuid)',
    'site_list_clubs()',
    'site_list_competitions()',
    'site_list_match_roster(p_id uuid)',
    'site_list_matches(p_season_id uuid, p_team_id uuid)',
    'site_list_seasons()',
    'site_list_venues()'
  ];
  v_bad text;
  v_denied boolean;
begin
  -- ANON-1
  select string_agg(c.relname || ' (' || c.relkind::text || ')', ', ' order by c.relname) into v_bad
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'v', 'm', 'f', 'p', 'S')
    and (
      has_table_privilege('anon', c.oid, 'SELECT')
      or has_table_privilege('anon', c.oid, 'INSERT')
      or has_table_privilege('anon', c.oid, 'UPDATE')
      or has_table_privilege('anon', c.oid, 'DELETE')
    );
  if v_bad is not null then
    raise exception 'ANON-1 failed: anon can reach %', v_bad;
  end if;

  -- ANON-2
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ' order by p.proname)
  into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and not (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')') = any (v_allowed_functions);
  if v_bad is not null then
    raise exception 'ANON-2 failed: anon can execute functions outside the allow list: %', v_bad;
  end if;

  -- ANON-3
  if has_table_privilege('authenticated', 'public.age_squads', 'INSERT')
     or has_table_privilege('authenticated', 'public.age_squads', 'UPDATE')
     or has_table_privilege('authenticated', 'public.age_squads', 'DELETE')
     or has_table_privilege('authenticated', 'public.competition_teams', 'INSERT')
     or has_table_privilege('authenticated', 'public.competition_teams', 'UPDATE')
     or has_table_privilege('authenticated', 'public.competition_teams', 'DELETE') then
    raise exception 'ANON-3 failed: authenticated can write through a teams view';
  end if;
  if not exists (
    select 1 from pg_class
    where oid = 'public.competition_teams'::regclass
      and 'security_invoker=true' = any (coalesce(reloptions, array[]::text[]))
  ) or not exists (
    select 1 from pg_class
    where oid = 'public.age_squads'::regclass
      and 'security_invoker=true' = any (coalesce(reloptions, array[]::text[]))
  ) then
    raise exception 'ANON-3 failed: teams views must use security_invoker';
  end if;

  -- ANON-4
  set local role anon;
  v_denied := false;
  begin
    update public.competition_teams set name = name where true;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  reset role;
  if not v_denied then
    raise exception 'ANON-4 failed: anon updated competition_teams';
  end if;

  raise notice 'anon surface ok';
end
$$;

rollback;
