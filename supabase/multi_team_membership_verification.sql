-- 梯隊 (age squad) membership rules, as enforced by enforce_team_membership_rules
-- (latest in 20261002120000_primary_and_cross_squad.sql).
-- Self-contained; rolls back. Staging SQL Editor or CI (scripts/db-verify.sh).
-- Do not run against production. Synthetic names only.
--
-- This file used to test the PR #22 "two active teams, one step up" ladder from
-- 20260909100000. Stage ST (20260910000000) replaced those rules; the 隊伍
-- (competition team) rules are covered in stage_st_verification.sql. Since
-- Phase 1 PR-05 these rules apply to the primary 梯隊 (rows without squad_role
-- default to primary); the cross 梯隊 is covered in cross_squad_verification.sql.

begin;

do $$
declare
  v_today date := public.club_today();
  v_birth date;
  v_band public.age_band;
  v_squad uuid;
  v_other_squad uuid;
  v_player uuid;
  v_membership uuid;
begin
  select d::date into v_birth
  from generate_series(v_today - interval '9 years', v_today - interval '5 years', interval '1 month') as g(d)
  where public.age_squad_band_from_birth_date(d::date, v_today) = 'U8'
  limit 1;
  v_band := public.age_squad_band_from_birth_date(v_birth, v_today);

  select id into v_squad from public.teams where kind = 'age_squad' and age_band = v_band;
  select id into v_other_squad from public.teams where kind = 'age_squad' and age_band = 'U10';
  if v_squad is null or v_other_squad is null then
    raise exception 'fixture: seeded 梯隊 U8 and U10 are required';
  end if;
  update public.teams set status = 'active' where id in (v_squad, v_other_squad);

  insert into public.players (name_zh, name_en_given, name_en_family, birth_date)
  values ('多隊驗證', 'TMT', 'Verify', v_birth) returning id into v_player;

  -- TMT-1: a 梯隊 whose band does not match the birth date is rejected.
  begin
    insert into public.team_memberships (player_id, team_id, jersey_number) values (v_player, v_other_squad, 31);
    raise exception 'TMT-1 failed: birth-U8 player accepted on 梯隊 U10';
  exception
    when others then
      if sqlerrm not like '%age squad band not allowed for this player%' then
        raise;
      end if;
      raise notice 'TMT-1 passed: wrong-band 梯隊 rejected';
  end;

  -- The matching 梯隊 is accepted.
  insert into public.team_memberships (player_id, team_id, jersey_number)
  values (v_player, v_squad, 31) returning id into v_membership;

  -- TMT-2: at most one active 梯隊. The band must match the birth date (TMT-1)
  -- and there is only one 梯隊 per band (teams_one_age_squad_per_band), so a
  -- second matching 梯隊 cannot exist. Check that guarantee directly.
  begin
    insert into public.teams (name, age_band, kind) values ('TMT second U8 梯隊', v_band, 'age_squad');
    raise exception 'TMT-2 failed: a second 梯隊 for the same band was accepted';
  exception
    when unique_violation then
      raise notice 'TMT-2 passed: one 梯隊 per band';
  end;

  -- TMT-3: editing the jersey on the existing 梯隊 row is allowed (self-update fix).
  update public.team_memberships set jersey_number = 33 where id = v_membership;
  if (select jersey_number from public.team_memberships where id = v_membership) is distinct from 33 then
    raise exception 'TMT-3 failed: jersey edit on the current 梯隊 did not apply';
  end if;
  raise notice 'TMT-3 passed: jersey edit on the current 梯隊';

  -- TMT-4: a 梯隊 row inserted without squad_role is the primary 梯隊 (PR-05).
  if (select squad_role from public.team_memberships where id = v_membership) is distinct from 'primary' then
    raise exception 'TMT-4 failed: 梯隊 row without squad_role is not primary';
  end if;
  raise notice 'TMT-4 passed: default squad_role is primary';
end;
$$;

rollback;
