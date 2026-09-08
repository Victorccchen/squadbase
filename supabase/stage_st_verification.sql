-- Stage ST verification (staging SQL Editor only).
-- Do not run against production. Synthetic names, not real PII.
-- Run AFTER 20260910000000_stage_st_age_squads_competition_teams.sql.
-- The block rolls back so staging stays empty unless you change ROLLBACK to COMMIT.

begin;

-- T-ST-8: Futuro sides exist as 隊伍 with locked layer_key + eligibility.
do $$
declare
  v_u8 public.teams%rowtype;
  v_u9 public.teams%rowtype;
  v_blue public.teams%rowtype;
  v_white public.teams%rowtype;
  v_squad_u8 uuid;
begin
  select * into v_u8 from public.teams where name = 'Futuro U8';
  select * into v_u9 from public.teams where name = 'Futuro U9';
  select * into v_blue from public.teams where name = 'Futuro U10藍';
  select * into v_white from public.teams where name = 'Futuro U10白';
  if v_u8.kind is distinct from 'competition_team' or v_u8.layer_key is distinct from 'u8'
     or v_u8.eligible_birth_ages is distinct from array['U6','U7','U8']::text[] then
    raise exception 'T-ST-8 failed: Futuro U8';
  end if;
  if v_u9.kind is distinct from 'competition_team' or v_u9.layer_key is distinct from 'u9'
     or v_u9.eligible_birth_ages is distinct from array['U8','U9']::text[] then
    raise exception 'T-ST-8 failed: Futuro U9';
  end if;
  if v_blue.kind is distinct from 'competition_team' or v_blue.layer_key is distinct from 'u10'
     or v_white.layer_key is distinct from 'u10' then
    raise exception 'T-ST-8 failed: Futuro U10 藍/白 layer_key';
  end if;
  select id into v_squad_u8 from public.teams where kind = 'age_squad' and age_band = 'U8';
  if v_squad_u8 is null then
    raise exception 'T-ST-8 failed: missing 梯隊 U8';
  end if;
  raise notice 'T-ST-8 passed: Futuro 隊伍 + 梯隊 bands exist';
end
$$;

delete from public.team_memberships
where player_id in (
  select id from public.players
  where name_en_given = 'TST' and name_en_family = 'Verify'
);
delete from public.players
where name_en_given = 'TST' and name_en_family = 'Verify';

do $$
declare
  v_today date := public.club_today();
  v_season date := public.season_start_on(v_today);
  v_birth_u8 date := (v_season - interval '8 years')::date;
  v_birth_u9 date := (v_season - interval '9 years')::date;
  v_birth_u10 date := (v_season - interval '10 years')::date;
  v_birth_u7 date := (v_season - interval '7 years')::date;
  v_player uuid;
  v_squad uuid;
  v_u8 uuid;
  v_u9 uuid;
  v_blue uuid;
  v_white uuid;
begin
  if public.birth_age_label_from_birth_date(v_birth_u8, v_today) is distinct from 'U8' then
    raise exception 'T-ST helper failed: expected birth U8 for % on %', v_birth_u8, v_today;
  end if;
  if public.age_squad_band_from_birth_date(v_birth_u8, v_today) is distinct from 'U8' then
    raise exception 'T-ST helper failed: birth U8 must map to 梯隊 U8';
  end if;
  if public.age_squad_band_from_birth_date(v_birth_u9, v_today) is distinct from 'U10' then
    raise exception 'T-ST helper failed: birth U9 must map to 梯隊 U10';
  end if;

  select id into v_squad from public.teams where kind = 'age_squad' and age_band = 'U8' limit 1;
  select id into v_u8 from public.teams where name = 'Futuro U8';
  select id into v_u9 from public.teams where name = 'Futuro U9';
  select id into v_blue from public.teams where name = 'Futuro U10藍';
  select id into v_white from public.teams where name = 'Futuro U10白';

  insert into public.players (
    name_zh, name_en_given, name_en_family, name_ja, birth_date, status, continues_training
  )
  values ('驗證ST', 'TST', 'Verify', null, v_birth_u8, 'active', true)
  returning id into v_player;

  insert into public.team_memberships (player_id, team_id, jersey_number, status)
  values (v_player, v_squad, 8, 'active');

  -- T-ST-1 Birth U8: Futuro U8 + U9 OK
  insert into public.team_memberships (player_id, team_id, jersey_number, status)
  values (v_player, v_u8, 8, 'active');
  insert into public.team_memberships (player_id, team_id, jersey_number, status)
  values (v_player, v_u9, 9, 'active');

  insert into public.teams (name, age_band, status, kind, layer_key, eligible_birth_ages)
  values ('TST Extra U6', 'U6', 'active', 'competition_team', 'u6', array['U6','U7','U8']::text[])
  returning id into v_white; -- reuse v_white as extra id for this block

  begin
    insert into public.team_memberships (player_id, team_id, jersey_number, status)
    values (v_player, v_white, 6, 'active');
    raise exception 'T-ST-1 failed: third 隊伍 was accepted';
  exception
    when others then
      if sqlerrm not like '%player already has 2 active memberships%' then
        raise;
      end if;
      raise notice 'T-ST-1 passed: third 隊伍 rejected';
  end;

  delete from public.team_memberships where team_id = v_white;
  delete from public.teams where id = v_white;
  select id into v_white from public.teams where name = 'Futuro U10白';

  update public.team_memberships
  set status = 'inactive'
  where player_id = v_player and team_id = v_u9;

  begin
    insert into public.team_memberships (player_id, team_id, jersey_number, status)
    values (v_player, v_blue, 11, 'active');
    raise exception 'T-ST-1 failed: U10藍 accepted for birth U8';
  exception
    when others then
      if sqlerrm not like '%birth age not eligible%' then
        raise;
      end if;
      raise notice 'T-ST-1 passed: U10藍 rejected for birth U8';
  end;

  delete from public.team_memberships where player_id = v_player;
  delete from public.players where id = v_player;

  -- T-ST-2 Birth U9
  insert into public.players (
    name_zh, name_en_given, name_en_family, name_ja, birth_date, status, continues_training
  )
  values ('驗證ST', 'TST', 'Verify', null, v_birth_u9, 'active', true)
  returning id into v_player;

  insert into public.team_memberships (player_id, team_id, jersey_number, status)
  values (v_player, v_u9, 9, 'active');
  insert into public.team_memberships (player_id, team_id, jersey_number, status)
  values (v_player, v_blue, 10, 'active');

  begin
    insert into public.team_memberships (player_id, team_id, jersey_number, status)
    values (v_player, v_white, 11, 'active');
    raise exception 'T-ST-2 failed: U10白 while on 藍 was accepted';
  exception
    when others then
      if sqlerrm not like '%competition team on this layer%' then
        raise;
      end if;
      raise notice 'T-ST-2 passed: same layer_key rejected';
  end;

  update public.team_memberships
  set status = 'inactive'
  where player_id = v_player and team_id = v_blue;

  begin
    insert into public.team_memberships (player_id, team_id, jersey_number, status)
    values (v_player, v_u8, 8, 'active');
    raise exception 'T-ST-2 failed: Futuro U8 accepted for birth U9';
  exception
    when others then
      if sqlerrm not like '%birth age not eligible%' then
        raise;
      end if;
      raise notice 'T-ST-2 passed: Futuro U8 rejected for birth U9';
  end;

  delete from public.team_memberships where player_id = v_player;
  delete from public.players where id = v_player;

  -- T-ST-3 Birth U10
  insert into public.players (
    name_zh, name_en_given, name_en_family, name_ja, birth_date, status, continues_training
  )
  values ('驗證ST', 'TST', 'Verify', null, v_birth_u10, 'active', true)
  returning id into v_player;

  insert into public.team_memberships (player_id, team_id, jersey_number, status)
  values (v_player, v_white, 10, 'active');

  begin
    insert into public.team_memberships (player_id, team_id, jersey_number, status)
    values (v_player, v_u9, 9, 'active');
    raise exception 'T-ST-3 failed: Futuro U9 accepted for birth U10';
  exception
    when others then
      if sqlerrm not like '%birth age not eligible%' then
        raise;
      end if;
      raise notice 'T-ST-3 passed: U9 rejected for birth U10';
  end;

  begin
    insert into public.team_memberships (player_id, team_id, jersey_number, status)
    values (v_player, v_u8, 8, 'active');
    raise exception 'T-ST-3 failed: Futuro U8 accepted for birth U10';
  exception
    when others then
      if sqlerrm not like '%birth age not eligible%' then
        raise;
      end if;
      raise notice 'T-ST-3 passed: U8 rejected for birth U10';
  end;

  begin
    insert into public.team_memberships (player_id, team_id, jersey_number, status)
    values (v_player, v_blue, 11, 'active');
    raise exception 'T-ST-3 failed: U10藍 while on 白 was accepted';
  exception
    when others then
      if sqlerrm not like '%competition team on this layer%' then
        raise;
      end if;
      raise notice 'T-ST-3 passed: U10藍 while on 白 rejected';
  end;

  delete from public.team_memberships where player_id = v_player;
  delete from public.players where id = v_player;

  -- T-ST-4 Birth U7
  insert into public.players (
    name_zh, name_en_given, name_en_family, name_ja, birth_date, status, continues_training
  )
  values ('驗證ST', 'TST', 'Verify', null, v_birth_u7, 'active', true)
  returning id into v_player;

  insert into public.team_memberships (player_id, team_id, jersey_number, status)
  values (v_player, v_u8, 7, 'active');

  begin
    insert into public.team_memberships (player_id, team_id, jersey_number, status)
    values (v_player, v_u9, 9, 'active');
    raise exception 'T-ST-4 failed: Futuro U9 accepted for birth U7';
  exception
    when others then
      if sqlerrm not like '%birth age not eligible%' then
        raise;
      end if;
      raise notice 'T-ST-4 passed: U9/U10 rejected for birth U7';
  end;

  delete from public.team_memberships where player_id = v_player;
  delete from public.players where id = v_player;

  -- T-ST-5 continues_training
  insert into public.players (
    name_zh, name_en_given, name_en_family, name_ja, birth_date, status, continues_training
  )
  values ('驗證ST', 'TST', 'Verify', null, v_birth_u8, 'active', false)
  returning id into v_player;

  begin
    insert into public.team_memberships (player_id, team_id, jersey_number, status)
    values (v_player, v_u8, 8, 'active');
    raise exception 'T-ST-5 failed: 隊伍 add without continues_training';
  exception
    when others then
      if sqlerrm not like '%does not continue training%' then
        raise;
      end if;
      raise notice 'T-ST-5 passed: continues_training required';
  end;

  delete from public.team_memberships where player_id = v_player;
  delete from public.players where id = v_player;

  -- T-ST-7 jersey unique within one 隊伍; same number on another 隊伍 OK
  insert into public.players (
    name_zh, name_en_given, name_en_family, name_ja, birth_date, status, continues_training
  )
  values ('驗證ST', 'TST', 'Verify', null, v_birth_u8, 'active', true)
  returning id into v_player;

  insert into public.team_memberships (player_id, team_id, jersey_number, status)
  values (v_player, v_u8, 22, 'active');
  insert into public.team_memberships (player_id, team_id, jersey_number, status)
  values (v_player, v_u9, 22, 'active');

  begin
    insert into public.players (
      name_zh, name_en_given, name_en_family, name_ja, birth_date, status, continues_training
    )
    values ('驗證ST2', 'TST', 'Verify', null, v_birth_u8, 'active', true)
    returning id into v_squad;
    insert into public.team_memberships (player_id, team_id, jersey_number, status)
    values (v_squad, v_u8, 22, 'active');
    raise exception 'T-ST-7 failed: duplicate jersey on same 隊伍';
  exception
    when unique_violation then
      raise notice 'T-ST-7 passed: jersey unique within 隊伍; cross-隊伍 repeat allowed';
    when others then
      if sqlerrm like '%T-ST-7 failed%' then
        raise;
      end if;
      raise notice 'T-ST-7 passed: jersey unique within 隊伍';
  end;

  delete from public.team_memberships
  where player_id in (select id from public.players where name_en_family = 'Verify' and name_en_given in ('TST'));
  delete from public.players
  where name_en_family = 'Verify' and name_en_given in ('TST');
end
$$;

rollback;
