-- Public roster privacy verification (spec v4 §8.1-6). Does not leave rows.
-- Do not run on production.
-- Paste this file's CONTENTS in the staging SQL Editor (not a path string).
--
-- PRIV-1: anon gets no roster for a youth (U8–U18) match, even when published.
-- PRIV-2: anon gets the roster of a senior match, minus anyone under 18 on
--         the match date (Asia/Taipei).
-- PRIV-3: a player who turns 18 on the match date is included.
-- PRIV-4: the same holds for a reserve-team match.
-- PRIV-5: anon still cannot read match_roster or players directly.

begin;

do $$
declare
  v_youth_team uuid;
  v_senior_team uuid;
  v_reserve_team uuid;
  v_youth_match uuid;
  v_senior_match uuid;
  v_reserve_match uuid;
  v_kickoff timestamptz := timestamptz '2026-10-11 15:30:00+08';
  v_match_day date := date '2026-10-11';
  v_adult uuid;
  v_minor uuid;
  v_birthday_today uuid;
  v_child uuid;
  v_count integer;
  v_names text[];
  v_denied boolean;
begin
  insert into public.teams (name, age_band, kind, layer_key, eligible_birth_ages)
  values ('PRIV youth', 'U12', 'competition_team', 'u12', array['U12'])
  returning id into v_youth_team;
  insert into public.teams (name, age_band, kind, layer_key, eligible_birth_ages)
  values ('PRIV senior', 'senior', 'competition_team', 'senior', array['senior'])
  returning id into v_senior_team;
  insert into public.teams (name, age_band, kind, layer_key, eligible_birth_ages)
  values ('PRIV reserve', 'reserve', 'competition_team', 'reserve', array['senior'])
  returning id into v_reserve_team;

  insert into public.players (birth_date, name_en_given, name_en_family, name_zh)
  values ((v_match_day - interval '25 years')::date, 'Adult', 'PRIV', '成年')
  returning id into v_adult;
  insert into public.players (birth_date, name_en_given, name_en_family, name_zh)
  values ((v_match_day - interval '17 years')::date, 'Minor', 'PRIV', '未成年')
  returning id into v_minor;
  insert into public.players (birth_date, name_en_given, name_en_family, name_zh)
  values ((v_match_day - interval '18 years')::date, 'Birthday', 'PRIV', '剛滿十八')
  returning id into v_birthday_today;
  insert into public.players (birth_date, name_en_given, name_en_family, name_zh)
  values ((v_match_day - interval '11 years')::date, 'Child', 'PRIV', '兒童')
  returning id into v_child;

  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind)
  values (v_youth_team, v_kickoff, v_kickoff + interval '90 minutes', 'PRIV youth match', 'league')
  returning id into v_youth_match;
  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind)
  values (v_senior_team, v_kickoff, v_kickoff + interval '150 minutes', 'PRIV senior match', 'league')
  returning id into v_senior_match;
  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind)
  values (v_reserve_team, v_kickoff, v_kickoff + interval '150 minutes', 'PRIV reserve match', 'friendly')
  returning id into v_reserve_match;

  insert into public.match_publications (session_id, opponent, side, is_published, public_status, published_at)
  values
    (v_youth_match, 'PRIV opponent', 'home', true, 'scheduled', now()),
    (v_senior_match, 'PRIV opponent', 'away', true, 'scheduled', now()),
    (v_reserve_match, 'PRIV opponent', 'home', true, 'scheduled', now());

  insert into public.match_roster (session_id, player_id, jersey_number)
  values
    (v_youth_match, v_child, 7),
    (v_senior_match, v_adult, 10),
    (v_senior_match, v_minor, 11),
    (v_senior_match, v_birthday_today, 12),
    (v_reserve_match, v_adult, 10),
    (v_reserve_match, v_minor, 11);

  set local role anon;

  -- PRIV-1
  select count(*) into v_count from public.list_published_match_roster(v_youth_match);
  if v_count <> 0 then
    raise exception 'PRIV-1 failed: youth match roster returned % rows to anon', v_count;
  end if;

  -- PRIV-2, PRIV-3
  select array_agg(name_zh order by jersey_number) into v_names
  from public.list_published_match_roster(v_senior_match);
  if v_names is distinct from array['成年', '剛滿十八'] then
    raise exception 'PRIV-2/3 failed: senior roster for anon was %', v_names;
  end if;

  -- PRIV-4
  select array_agg(name_zh order by jersey_number) into v_names
  from public.list_published_match_roster(v_reserve_match);
  if v_names is distinct from array['成年'] then
    raise exception 'PRIV-4 failed: reserve roster for anon was %', v_names;
  end if;

  -- PRIV-5
  v_denied := false;
  begin
    perform 1 from public.match_roster limit 1;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'PRIV-5 failed: anon can select match_roster';
  end if;
  v_denied := false;
  begin
    perform 1 from public.players limit 1;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'PRIV-5 failed: anon can select players';
  end if;

  reset role;
  raise notice 'public roster privacy ok';
end
$$;

rollback;
