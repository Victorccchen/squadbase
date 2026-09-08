-- Jersey self-update verification (staging SQL Editor only).
-- Do not run against production. Synthetic names, not real PII.
-- Run AFTER 20260911000000_player_membership_jersey_self_update.sql.
-- The block rolls back so staging stays empty unless you change ROLLBACK to COMMIT.

begin;

delete from public.team_memberships
where player_id in (
  select id from public.players
  where name_en_given = 'JSY' and name_en_family = 'Verify'
);
delete from public.players
where name_en_given = 'JSY' and name_en_family = 'Verify';

do $$
declare
  v_today date := public.club_today();
  v_season date := public.season_start_on(v_today);
  v_birth_u8 date := (v_season - interval '8 years')::date;
  v_player uuid;
  v_other uuid;
  v_squad uuid;
  v_u8 uuid;
begin
  select id into v_squad from public.teams where kind = 'age_squad' and age_band = 'U8' limit 1;
  select id into v_u8 from public.teams where name = 'Futuro U8';
  if v_squad is null or v_u8 is null then
    raise exception 'jersey verify failed: missing 梯隊 U8 or Futuro U8';
  end if;

  insert into public.players (
    name_zh, name_en_given, name_en_family, name_ja, birth_date, status, continues_training
  )
  values ('驗證背號', 'JSY', 'Verify', null, v_birth_u8, 'active', true)
  returning id into v_player;

  insert into public.team_memberships (player_id, team_id, jersey_number, status)
  values (v_player, v_squad, 91, 'active');
  insert into public.team_memberships (player_id, team_id, jersey_number, status)
  values (v_player, v_u8, 99, 'active');

  -- In-place change 99 → 91 on Futuro U8. Same number on 梯隊 must not block.
  update public.team_memberships
  set jersey_number = 91
  where player_id = v_player
    and team_id = v_u8
    and status = 'active';
  if not found then
    raise exception 'jersey self-update failed: Futuro U8 row missing';
  end if;

  -- Changing to the current number (no-op) must also succeed.
  update public.team_memberships
  set jersey_number = 91
  where player_id = v_player
    and team_id = v_u8
    and status = 'active';

  insert into public.players (
    name_zh, name_en_given, name_en_family, name_ja, birth_date, status, continues_training
  )
  values ('驗證背號2', 'JSY', 'Verify', null, v_birth_u8, 'active', true)
  returning id into v_other;

  insert into public.team_memberships (player_id, team_id, jersey_number, status)
  values (v_other, v_squad, 8, 'active');

  begin
    insert into public.team_memberships (player_id, team_id, jersey_number, status)
    values (v_other, v_u8, 91, 'active');
    raise exception 'jersey taken failed: duplicate 91 on Futuro U8 was accepted';
  exception
    when unique_violation then
      raise notice 'jersey taken passed: 91 blocked for another player on Futuro U8';
    when others then
      if sqlerrm like '%jersey taken failed%' then
        raise;
      end if;
      raise;
  end;

  raise notice 'jersey self-update passed: 99→91 on Futuro U8 while 梯隊 keeps 91';
end
$$;

delete from public.team_memberships
where player_id in (
  select id from public.players
  where name_en_given = 'JSY' and name_en_family = 'Verify'
);
delete from public.players
where name_en_given = 'JSY' and name_en_family = 'Verify';

rollback;
