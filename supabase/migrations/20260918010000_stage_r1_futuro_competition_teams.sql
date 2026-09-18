-- Stage R1: add Torneopal FUTURO 隊伍 used by the zh roster seed.
-- Staging only. Do not run against production.
--
-- Adds Futuro U10 (白/藍 collapsed), Futuro U11, Futuro U12 黃, Futuro U12 藍.
-- Does not drop Stage ST Futuro U10藍 / Futuro U10白 rows.
-- Idempotent. Safe to re-run.
--
-- Victor: paste this file's CONTENTS into the staging SQL Editor, not a path string.

create or replace function public.default_eligible_birth_ages(p_layer_key text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_layer_key
    when 'u6' then array['U6']
    when 'u8' then array['U6', 'U7', 'U8']
    when 'u9' then array['U8', 'U9']
    when 'u10' then array['U9', 'U10']
    when 'u11' then array['U10', 'U11']
    when 'u12' then array['U11', 'U12']
    when 'u15' then array['U13', 'U14', 'U15']
    when 'u18' then array['U16', 'U17', 'U18']
    when 'reserve' then array['senior']
    when 'senior' then array['senior']
    else array[]::text[]
  end;
$$;

insert into public.teams (name, age_band, status, kind, layer_key, eligible_birth_ages)
select seed.name, seed.age_band, 'active', 'competition_team', seed.layer_key, seed.eligible
from (
  values
    ('Futuro U10'::text, 'U10'::public.age_band, 'u10'::text, array['U9', 'U10']::text[]),
    ('Futuro U11', 'U12', 'u11', array['U10', 'U11']),
    ('Futuro U12 黃', 'U12', 'u12', array['U11', 'U12']),
    ('Futuro U12 藍', 'U12', 'u12', array['U11', 'U12'])
) as seed(name, age_band, layer_key, eligible)
where not exists (select 1 from public.teams t where t.name = seed.name);

update public.teams t
set kind = 'competition_team',
    layer_key = seed.layer_key,
    eligible_birth_ages = seed.eligible,
    age_band = seed.age_band,
    status = 'active'
from (
  values
    ('Futuro U10'::text, 'U10'::public.age_band, 'u10'::text, array['U9', 'U10']::text[]),
    ('Futuro U11', 'U12', 'u11', array['U10', 'U11']),
    ('Futuro U12 黃', 'U12', 'u12', array['U11', 'U12']),
    ('Futuro U12 藍', 'U12', 'u12', array['U11', 'U12'])
) as seed(name, age_band, layer_key, eligible)
where t.name = seed.name;

comment on function public.default_eligible_birth_ages(text) is
  'Default birth-age labels for a 隊伍 layer_key. u11 added in Stage R1.';

revoke all on function public.default_eligible_birth_ages(text) from public, anon;
grant execute on function public.default_eligible_birth_ages(text) to authenticated;
