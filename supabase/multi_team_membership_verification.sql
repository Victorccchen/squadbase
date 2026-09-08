-- Multi-team membership verification (staging SQL Editor only).
-- Do not run against production. Synthetic names, not real PII.
-- Run AFTER applying 20260909100000_multi_team_membership_rules.sql.
-- The block rolls back so staging stays empty unless you change ROLLBACK to COMMIT.

begin;

delete from public.team_memberships
where player_id in (
  select id from public.players
  where name_en_given = 'TMT' and name_en_family = 'Verify'
);
delete from public.players
where name_en_given = 'TMT' and name_en_family = 'Verify';
delete from public.teams
where name in (
  'TMT Verify U6',
  'TMT Verify U8',
  'TMT Verify U10',
  'TMT Verify U12'
);

do $$
declare
  v_today date := public.club_today();
  v_season date := public.season_start_on(v_today);
  v_birth_u8 date := (v_season - interval '7 years')::date;
  v_player uuid;
  v_u6 uuid;
  v_u8 uuid;
  v_u10 uuid;
  v_u12 uuid;
begin
  insert into public.teams (name, age_band, status)
  values
    ('TMT Verify U6', 'U6', 'active'),
    ('TMT Verify U8', 'U8', 'active'),
    ('TMT Verify U10', 'U10', 'active'),
    ('TMT Verify U12', 'U12', 'active');

  select id into v_u6 from public.teams where name = 'TMT Verify U6';
  select id into v_u8 from public.teams where name = 'TMT Verify U8';
  select id into v_u10 from public.teams where name = 'TMT Verify U10';
  select id into v_u12 from public.teams where name = 'TMT Verify U12';

  if public.computed_age_band_from_birth_date(v_birth_u8, v_today) is distinct from 'U8' then
    raise exception 'TMT helper failed: expected natural U8 for % on %', v_birth_u8, v_today;
  end if;
  if public.next_higher_computed_age_band('U8') is distinct from 'U10' then
    raise exception 'TMT-4 failed: next higher from U8 must be U10 (no U9 in ladder)';
  end if;

  insert into public.players (
    name_zh, name_en_given, name_en_family, name_ja, birth_date, status
  )
  values ('驗證多隊', 'TMT', 'Verify', null, v_birth_u8, 'active')
  returning id into v_player;

  -- TMT-2: same band allowed.
  insert into public.team_memberships (player_id, team_id, jersey_number, status)
  values (v_player, v_u8, 8, 'active');

  -- TMT-2 / TMT-3: one step up (U10) allowed as the second active row.
  insert into public.team_memberships (player_id, team_id, jersey_number, status)
  values (v_player, v_u10, 10, 'active');

  -- TMT-1 / TMT-3: a third active membership is rejected.
  begin
    insert into public.team_memberships (player_id, team_id, jersey_number, status)
    values (v_player, v_u12, 12, 'active');
    raise exception 'TMT-1 failed: third active membership was accepted';
  exception
    when others then
      if sqlerrm not like '%player already has 2 active memberships%' then
        raise;
      end if;
      raise notice 'TMT-1 / TMT-3 passed: third active membership rejected';
  end;

  -- TMT-2: down-band (U6) rejected even after ending one slot.
  update public.team_memberships
  set status = 'inactive'
  where player_id = v_player
    and team_id = v_u10;

  begin
    insert into public.team_memberships (player_id, team_id, jersey_number, status)
    values (v_player, v_u6, 6, 'active');
    raise exception 'TMT-2 failed: U8 natural on U6 team was accepted';
  exception
    when others then
      if sqlerrm not like '%team age band not allowed for this player%' then
        raise;
      end if;
      raise notice 'TMT-2 passed: down-band U6 rejected; U8+U10 play-up allowed';
  end;
end
$$;

rollback;
