-- Stage 2 verification: player name rules and jersey uniqueness.
-- Self-contained; rolls back. Staging SQL Editor or CI (scripts/db-verify.sh).
-- Do not run against production. Synthetic names only.
--
-- Updated for Stage ST (20260910000000): players train on exactly one 梯隊
-- (age squad, one per band) and may join 隊伍 (competition teams), so the
-- fixtures use the seeded age squad and a throwaway 隊伍 instead of plain teams.
-- Read access to players / birth_date is covered by rls_matrix_verification.sql.

begin;

do $$
declare
  v_today date := public.club_today();
  v_birth date;
  v_band public.age_band;
  v_birth_label text;
  v_squad uuid;
  v_team_b uuid;
  v_a uuid;
  v_b uuid;
  v_c uuid;
begin
  -- A birth date whose band has a seeded 梯隊 (U10 here).
  select d::date into v_birth
  from generate_series(v_today - interval '12 years', v_today - interval '7 years', interval '1 month') as g(d)
  where public.age_squad_band_from_birth_date(d::date, v_today) = 'U10'
  limit 1;
  v_band := public.age_squad_band_from_birth_date(v_birth, v_today);
  v_birth_label := public.birth_age_label_from_birth_date(v_birth, v_today);

  select id into v_squad from public.teams where kind = 'age_squad' and age_band = v_band;
  if v_squad is null then
    insert into public.teams (name, age_band, kind) values ('Stage2 Verify 梯隊', v_band, 'age_squad')
    returning id into v_squad;
  end if;
  update public.teams set status = 'active' where id = v_squad;

  insert into public.teams (name, age_band, kind, layer_key, eligible_birth_ages)
  values ('Stage2 Verify 隊伍 B', v_band, 'competition_team', 'stage2_verify', array[v_birth_label])
  returning id into v_team_b;

  insert into public.players (name_zh, name_en_given, name_en_family, name_ja, birth_date)
  values ('驗證甲', 'Stage2', 'Verify A', '検証A', v_birth) returning id into v_a;
  insert into public.players (name_zh, name_en_given, name_en_family, name_ja, birth_date)
  values ('驗證乙', 'Stage2', 'Verify B', null, v_birth) returning id into v_b;
  insert into public.players (name_zh, name_en_given, name_en_family, name_ja, birth_date)
  values (null, 'Stage2', 'Verify C', '検証C', v_birth) returning id into v_c;

  -- T2-8: a player needs a Chinese or Japanese name.
  begin
    insert into public.players (name_zh, name_en_given, name_en_family, name_ja, birth_date)
    values (null, 'Stage2', 'Verify Empty CJK', null, v_birth);
    raise exception 'T2-8 failed: player without zh/ja was accepted';
  exception
    when check_violation then
      raise notice 'T2-8 passed: missing zh and ja rejected';
  end;

  -- T2-3: the same jersey number on different teams is allowed.
  insert into public.team_memberships (player_id, team_id, jersey_number) values (v_a, v_squad, 7);
  insert into public.team_memberships (player_id, team_id, jersey_number) values (v_b, v_team_b, 7);
  raise notice 'T2-3 passed: jersey 7 on two different teams';

  -- T2-2: a duplicate jersey on the same team is rejected.
  begin
    insert into public.team_memberships (player_id, team_id, jersey_number) values (v_c, v_squad, 7);
    raise exception 'T2-2 failed: duplicate jersey on the same team was accepted';
  exception
    when unique_violation then
      raise notice 'T2-2 passed: duplicate jersey rejected (23505)';
  end;
end;
$$;

rollback;
