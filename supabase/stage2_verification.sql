-- Stage 2 verification helpers (staging SQL Editor only).
-- Do not run against production. These statements use synthetic names, not real PII.
-- Run AFTER applying 20260902120000_stage2_org_master.sql.

-- =============================================================================
-- T2-2 / T2-3: jersey uniqueness (constraint; service role / SQL editor bypasses RLS)
-- Expected:
--   * second insert on the same team with jersey 7 fails (23505)
--   * same jersey 7 on a different team succeeds
-- The block rolls back so staging stays empty unless you change ROLLBACK to COMMIT.
-- =============================================================================

begin;

delete from public.team_memberships
where player_id in (
  select id from public.players
  where name_en in ('Stage2 Verify A', 'Stage2 Verify B', 'Stage2 Verify C')
);
delete from public.players
where name_en in ('Stage2 Verify A', 'Stage2 Verify B', 'Stage2 Verify C');
delete from public.teams
where name in ('Stage2 Verify Team A', 'Stage2 Verify Team B');

insert into public.teams (name, age_band, status)
values
  ('Stage2 Verify Team A', 'U12', 'active'),
  ('Stage2 Verify Team B', 'U12', 'active');

insert into public.players (name_zh, name_en, name_ja, birth_date, status)
values
  ('驗證甲', 'Stage2 Verify A', '検証A', '2014-08-15', 'active'),
  ('驗證乙', 'Stage2 Verify B', '検証B', '2014-08-16', 'active'),
  ('驗證丙', 'Stage2 Verify C', '検証C', '2014-08-17', 'active');

-- T2-3: same jersey on different teams is allowed.
insert into public.team_memberships (player_id, team_id, jersey_number, status)
select p.id, t.id, 7, 'active'
from public.players p
join public.teams t on t.name = 'Stage2 Verify Team A'
where p.name_en = 'Stage2 Verify A';

insert into public.team_memberships (player_id, team_id, jersey_number, status)
select p.id, t.id, 7, 'active'
from public.players p
join public.teams t on t.name = 'Stage2 Verify Team B'
where p.name_en = 'Stage2 Verify B';

-- T2-2: duplicate jersey on the same team must fail.
do $$
begin
  insert into public.team_memberships (player_id, team_id, jersey_number, status)
  select p.id, t.id, 7, 'active'
  from public.players p
  join public.teams t on t.name = 'Stage2 Verify Team A'
  where p.name_en = 'Stage2 Verify C';

  raise exception 'T2-2 failed: duplicate jersey on the same team was accepted';
exception
  when unique_violation then
    raise notice 'T2-2 passed: duplicate jersey rejected (23505)';
end
$$;

-- Leave committed only if you want the synthetic rows for UI checks.
-- Prefer rolling back so staging stays empty:
rollback;

-- To keep the rows for a UI smoke test, replace rollback with commit, then
-- delete them from Table Editor when finished.

-- =============================================================================
-- RLS (T2-5 / birth_date protection): fill in real user UUIDs from Auth.
-- Parent (no coach/admin): 0 player rows, 0 birth_date values.
-- Coach assigned only to team A: can read team A players, not team B.
-- Anon: 0 rows.
-- =============================================================================

-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claim.sub', 'PARENT_OR_COACH_UUID', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select count(*) as player_rows_visible from public.players;
-- select count(*) as birth_dates_visible
-- from public.players
-- where birth_date is not null;
--
-- set local role anon;
-- select count(*) as anon_players from public.players;
-- select count(*) as anon_teams from public.teams;
-- rollback;
