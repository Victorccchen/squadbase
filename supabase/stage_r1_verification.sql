-- Optional Stage R1 check (staging only). Rolls back. Do not run on production.
-- Asserts Torneopal 隊伍 exist with locked layer_key + eligibility.

do $$
declare
  v_u10 public.teams%rowtype;
  v_u11 public.teams%rowtype;
  v_yellow public.teams%rowtype;
  v_blue public.teams%rowtype;
begin
  select * into v_u10 from public.teams where name = 'Futuro U10';
  select * into v_u11 from public.teams where name = 'Futuro U11';
  select * into v_yellow from public.teams where name = 'Futuro U12 黃';
  select * into v_blue from public.teams where name = 'Futuro U12 藍';

  if v_u10.kind is distinct from 'competition_team' or v_u10.layer_key is distinct from 'u10' then
    raise exception 'R1 failed: Futuro U10';
  end if;
  if v_u11.kind is distinct from 'competition_team' or v_u11.layer_key is distinct from 'u11' then
    raise exception 'R1 failed: Futuro U11';
  end if;
  if v_yellow.layer_key is distinct from 'u12' or v_blue.layer_key is distinct from 'u12' then
    raise exception 'R1 failed: Futuro U12 黃/藍 layer_key';
  end if;
  if v_u11.eligible_birth_ages is distinct from array['U10', 'U11']::text[] then
    raise exception 'R1 failed: Futuro U11 eligibility';
  end if;

  raise notice 'R1 passed: Torneopal Futuro U10/U11/U12 隊伍 exist';
end;
$$;

rollback;
