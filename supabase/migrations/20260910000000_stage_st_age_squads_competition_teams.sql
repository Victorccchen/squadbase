-- Stage ST: split conflated teams into 梯隊 (age_squad) and 隊伍
-- (competition_team). Staging only. Do not run against production.
--
-- Product lock (Victor):
--   * 梯隊 ladder (no U9/U11 梯隊): U6 → U8 → U10 → U12 → U15 → U18 → 預備隊 → 成人隊
--   * Birth U6–U8 → 梯隊 U8; birth U9–U10 → 梯隊 U10 (completed age on 15 Aug)
--   * 隊伍: max 2 active; same layer_key forbidden; birth eligibility on add;
--     continues_training required to add (historical rows are not stripped)
--   * Dual rule does NOT apply to 梯隊 (exactly one current 梯隊)
--   * Training (regular/special) attach to 梯隊; matches attach to 隊伍
--   * Jersey UNIQUE (team_id, jersey_number) — unique within one unit; cross-unit OK
-- PR #22 one-ladder-step-up membership is superseded.
-- Idempotent. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Types and columns
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'team_kind' and n.nspname = 'public'
  ) then
    create type public.team_kind as enum ('age_squad', 'competition_team');
  end if;
end
$$;

alter table public.teams
  add column if not exists kind public.team_kind,
  add column if not exists layer_key text,
  add column if not exists eligible_birth_ages text[];

alter table public.players
  add column if not exists continues_training boolean not null default true;

comment on column public.teams.kind is
  'age_squad = 梯隊 (roster band, training). competition_team = 隊伍 (match side).';
comment on column public.teams.layer_key is
  '隊伍 grouping key (u8/u9/u10/…). Two active 隊伍 with the same key are forbidden. Null on 梯隊.';
comment on column public.teams.eligible_birth_ages is
  'Birth-age labels allowed on this 隊伍 (e.g. {U6,U7,U8}). Null on 梯隊.';
comment on column public.players.continues_training is
  'Only continuing trainees may be added to 隊伍. Default true; historical memberships are not stripped.';

grant usage on type public.team_kind to authenticated;

-- ---------------------------------------------------------------------------
-- Birth-age + 梯隊 helpers (replace PR #22 ladder-up for membership)
-- ---------------------------------------------------------------------------

create or replace function public.birth_age_label_from_completed_age(p_age integer)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_age is null then null
    when p_age < 6 then 'U6'
    when p_age >= 18 then 'senior'
    else 'U' || p_age::text
  end;
$$;

create or replace function public.age_squad_band_from_completed_age(p_age integer)
returns public.age_band
language sql
immutable
set search_path = public
as $$
  select case
    when p_age is null then null
    when p_age < 6 then 'U6'::public.age_band
    when p_age <= 8 then 'U8'::public.age_band
    when p_age <= 10 then 'U10'::public.age_band
    when p_age <= 12 then 'U12'::public.age_band
    when p_age <= 15 then 'U15'::public.age_band
    when p_age < 18 then 'U18'::public.age_band
    else 'senior'::public.age_band
  end;
$$;

create or replace function public.birth_age_label_from_birth_date(
  p_birth_date date,
  p_as_of date
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_season date;
  v_age integer;
begin
  if p_birth_date is null or p_as_of is null then
    return null;
  end if;
  v_season := public.season_start_on(p_as_of);
  v_age := extract(year from age(v_season, p_birth_date))::integer;
  if v_age < 0 then
    v_age := 0;
  end if;
  return public.birth_age_label_from_completed_age(v_age);
end;
$$;

create or replace function public.age_squad_band_from_birth_date(
  p_birth_date date,
  p_as_of date
)
returns public.age_band
language plpgsql
immutable
set search_path = public
as $$
declare
  v_season date;
  v_age integer;
begin
  if p_birth_date is null or p_as_of is null then
    return null;
  end if;
  v_season := public.season_start_on(p_as_of);
  v_age := extract(year from age(v_season, p_birth_date))::integer;
  if v_age < 0 then
    v_age := 0;
  end if;
  return public.age_squad_band_from_completed_age(v_age);
end;
$$;

-- Keep the old name as the 梯隊 mapping so callers stay in sync with Stage ST.
create or replace function public.computed_age_band_from_birth_date(
  p_birth_date date,
  p_as_of date
)
returns public.age_band
language sql
immutable
set search_path = public
as $$
  select public.age_squad_band_from_birth_date(p_birth_date, p_as_of);
$$;

create or replace function public.layer_key_from_age_band(p_band public.age_band)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_band
    when 'U6' then 'u6'
    when 'U8' then 'u8'
    when 'U10' then 'u10'
    when 'U12' then 'u12'
    when 'U15' then 'u15'
    when 'U18' then 'u18'
    when 'reserve' then 'reserve'
    when 'senior' then 'senior'
    else null
  end;
$$;

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
    when 'u12' then array['U11', 'U12']
    when 'u15' then array['U13', 'U14', 'U15']
    when 'u18' then array['U16', 'U17', 'U18']
    when 'reserve' then array['senior']
    when 'senior' then array['senior']
    else array[]::text[]
  end;
$$;

create or replace function public.session_team_kind_allowed(
  p_session_kind public.session_kind,
  p_team_kind public.team_kind
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when p_session_kind in ('regular', 'special') then p_team_kind = 'age_squad'
    when p_session_kind in ('cup', 'league', 'friendly') then p_team_kind = 'competition_team'
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Seed 梯隊 + Futuro 隊伍; classify leftover rows as 隊伍
-- ---------------------------------------------------------------------------

insert into public.teams (name, age_band, status, kind, layer_key, eligible_birth_ages)
select seed.name, seed.age_band, 'active', 'age_squad', null, null
from (
  values
    ('梯隊 U6'::text, 'U6'::public.age_band),
    ('梯隊 U8', 'U8'),
    ('梯隊 U10', 'U10'),
    ('梯隊 U12', 'U12'),
    ('梯隊 U15', 'U15'),
    ('梯隊 U18', 'U18'),
    ('預備隊', 'reserve'),
    ('成人隊', 'senior')
) as seed(name, age_band)
where not exists (
  select 1 from public.teams t
  where t.kind = 'age_squad' and t.age_band = seed.age_band
)
and not exists (
  select 1 from public.teams t where t.name = seed.name
);

update public.teams
set kind = 'age_squad',
    layer_key = null,
    eligible_birth_ages = null
where name in ('梯隊 U6', '梯隊 U8', '梯隊 U10', '梯隊 U12', '梯隊 U15', '梯隊 U18', '預備隊', '成人隊')
  and (kind is distinct from 'age_squad' or kind is null);

insert into public.teams (name, age_band, status, kind, layer_key, eligible_birth_ages)
select seed.name, seed.age_band, 'active', 'competition_team', seed.layer_key, seed.eligible
from (
  values
    ('Futuro U8'::text, 'U8'::public.age_band, 'u8'::text, array['U6', 'U7', 'U8']::text[]),
    ('Futuro U9', 'U8', 'u9', array['U8', 'U9']),
    ('Futuro U10藍', 'U10', 'u10', array['U9', 'U10']),
    ('Futuro U10白', 'U10', 'u10', array['U9', 'U10'])
) as seed(name, age_band, layer_key, eligible)
where not exists (select 1 from public.teams t where t.name = seed.name);

update public.teams t
set kind = 'competition_team',
    layer_key = seed.layer_key,
    eligible_birth_ages = seed.eligible,
    age_band = seed.age_band
from (
  values
    ('Futuro U8'::text, 'U8'::public.age_band, 'u8'::text, array['U6', 'U7', 'U8']::text[]),
    ('Futuro U9', 'U8', 'u9', array['U8', 'U9']),
    ('Futuro U10藍', 'U10', 'u10', array['U9', 'U10']),
    ('Futuro U10白', 'U10', 'u10', array['U9', 'U10'])
) as seed(name, age_band, layer_key, eligible)
where t.name = seed.name;

update public.teams
set kind = 'competition_team',
    layer_key = coalesce(layer_key, public.layer_key_from_age_band(age_band)),
    eligible_birth_ages = coalesce(
      eligible_birth_ages,
      public.default_eligible_birth_ages(coalesce(layer_key, public.layer_key_from_age_band(age_band)))
    )
where kind is null;

update public.players p
set continues_training = true
where exists (
  select 1 from public.team_memberships m where m.player_id = p.id
)
and p.continues_training is distinct from true;

alter table public.teams
  alter column kind set default 'competition_team';

update public.teams set kind = 'competition_team' where kind is null;

alter table public.teams
  alter column kind set not null;

create unique index if not exists teams_one_age_squad_per_band
  on public.teams (age_band)
  where kind = 'age_squad';

alter table public.teams drop constraint if exists teams_kind_layer_key_check;
alter table public.teams
  add constraint teams_kind_layer_key_check check (
    (kind = 'age_squad' and layer_key is null)
    or (kind = 'competition_team' and layer_key is not null)
  );

alter table public.teams drop constraint if exists teams_competition_eligible_check;
alter table public.teams
  add constraint teams_competition_eligible_check check (
    kind = 'age_squad'
    or cardinality(coalesce(eligible_birth_ages, array[]::text[])) >= 1
  );

-- ---------------------------------------------------------------------------
-- Membership trigger (replaces PR #22 ladder-up)
-- ---------------------------------------------------------------------------

create or replace function public.enforce_team_membership_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_kind public.team_kind;
  v_layer text;
  v_eligible text[];
  v_team_band public.age_band;
  v_birth date;
  v_continues boolean;
  v_birth_age text;
  v_squad public.age_band;
  v_count integer;
begin
  if new.status is distinct from 'active' then
    return new;
  end if;

  select t.kind, t.layer_key, t.eligible_birth_ages, t.age_band
    into v_kind, v_layer, v_eligible, v_team_band
  from public.teams t
  where t.id = new.team_id;
  if not found then
    raise exception 'team not found' using errcode = 'P0002';
  end if;

  select birth_date, continues_training into v_birth, v_continues
  from public.players
  where id = new.player_id
  for update;
  if not found then
    raise exception 'player not found' using errcode = 'P0002';
  end if;

  v_birth_age := public.birth_age_label_from_birth_date(v_birth, public.club_today());
  v_squad := public.age_squad_band_from_birth_date(v_birth, public.club_today());

  if v_kind = 'age_squad' then
    if v_team_band is distinct from v_squad then
      raise exception 'age squad band not allowed for this player' using errcode = 'P0001';
    end if;
    select count(*)::integer into v_count
    from public.team_memberships m
    join public.teams t on t.id = m.team_id
    where m.player_id = new.player_id
      and m.status = 'active'
      and t.kind = 'age_squad'
      and m.id is distinct from new.id;
    if v_count >= 1 then
      raise exception 'player already has an active age squad' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and old.status is distinct from 'active') then
    if v_continues is not true then
      raise exception 'player does not continue training' using errcode = 'P0001';
    end if;
  end if;

  if v_eligible is null or not (v_birth_age = any (v_eligible)) then
    raise exception 'birth age not eligible for this competition team' using errcode = 'P0001';
  end if;

  if v_layer is not null and exists (
    select 1
    from public.team_memberships m
    join public.teams t on t.id = m.team_id
    where m.player_id = new.player_id
      and m.status = 'active'
      and t.kind = 'competition_team'
      and t.layer_key = v_layer
      and m.id is distinct from new.id
  ) then
    raise exception 'player already has a competition team on this layer' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_count
  from public.team_memberships m
  join public.teams t on t.id = m.team_id
  where m.player_id = new.player_id
    and m.status = 'active'
    and t.kind = 'competition_team'
    and m.id is distinct from new.id;
  if v_count >= 2 then
    raise exception 'player already has 2 active memberships' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists team_memberships_enforce_rules on public.team_memberships;
create trigger team_memberships_enforce_rules
  before insert or update on public.team_memberships
  for each row
  execute function public.enforce_team_membership_rules();

-- ---------------------------------------------------------------------------
-- Assign exactly one 梯隊 membership per player (do not strip 隊伍 rows)
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  v_squad uuid;
  v_jersey integer;
  v_band public.age_band;
begin
  for r in
    select p.id, p.birth_date
    from public.players p
    where not exists (
      select 1
      from public.team_memberships m
      join public.teams t on t.id = m.team_id
      where m.player_id = p.id
        and m.status = 'active'
        and t.kind = 'age_squad'
    )
  loop
    v_band := public.age_squad_band_from_birth_date(r.birth_date, public.club_today());
    select t.id into v_squad
    from public.teams t
    where t.kind = 'age_squad'
      and t.age_band = v_band
    order by t.status = 'active' desc, t.created_at
    limit 1;
    if v_squad is null then
      continue;
    end if;

    select m.jersey_number into v_jersey
    from public.team_memberships m
    where m.player_id = r.id
      and not exists (
        select 1
        from public.team_memberships x
        where x.team_id = v_squad
          and x.jersey_number = m.jersey_number
      )
    order by m.status = 'active' desc, m.updated_at desc
    limit 1;

    if v_jersey is null then
      select gs into v_jersey
      from generate_series(1, 99) as gs
      where not exists (
        select 1
        from public.team_memberships x
        where x.team_id = v_squad
          and x.jersey_number = gs
      )
      limit 1;
    end if;

    if v_jersey is null then
      continue;
    end if;

    insert into public.team_memberships (
      player_id, team_id, jersey_number, status
    )
    values (r.id, v_squad, v_jersey, 'active')
    on conflict (player_id, team_id) do update
      set jersey_number = excluded.jersey_number,
          status = 'active';
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Session attachment: training → 梯隊, matches → 隊伍
-- ---------------------------------------------------------------------------

create or replace function public.enforce_session_unit_kind()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_kind public.team_kind;
begin
  select t.kind into v_kind from public.teams t where t.id = new.team_id;
  if not found then
    raise exception 'team not found' using errcode = 'P0002';
  end if;
  if not public.session_team_kind_allowed(new.kind, v_kind) then
    raise exception 'session kind does not match team kind' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Repoint existing regular/special rows onto the 梯隊 of the same age_band
-- before attaching the trigger, so history does not fail the new rule.
update public.session_series s
set team_id = squad.id
from public.teams old
join public.teams squad
  on squad.kind = 'age_squad'
 and squad.age_band = old.age_band
where s.team_id = old.id
  and old.kind = 'competition_team'
  and s.kind in ('regular', 'special');

update public.training_sessions s
set team_id = squad.id
from public.teams old
join public.teams squad
  on squad.kind = 'age_squad'
 and squad.age_band = old.age_band
where s.team_id = old.id
  and old.kind = 'competition_team'
  and s.kind in ('regular', 'special');

drop trigger if exists training_sessions_enforce_unit_kind on public.training_sessions;
create trigger training_sessions_enforce_unit_kind
  before insert or update of team_id, kind on public.training_sessions
  for each row
  execute function public.enforce_session_unit_kind();

drop trigger if exists session_series_enforce_unit_kind on public.session_series;
create trigger session_series_enforce_unit_kind
  before insert or update of team_id, kind on public.session_series
  for each row
  execute function public.enforce_session_unit_kind();

-- Coaches assigned to a 隊伍 also see the matching 梯隊 roster/training.
insert into public.coach_team_assignments (coach_id, team_id, created_by, updated_by)
select a.coach_id, squad.id, a.created_by, a.updated_by
from public.coach_team_assignments a
join public.teams old on old.id = a.team_id
join public.teams squad
  on squad.kind = 'age_squad'
 and squad.age_band = old.age_band
where old.kind = 'competition_team'
on conflict (coach_id, team_id) do nothing;

-- Credits follow the player's 梯隊, not a 隊伍.
create or replace function public.player_team_catalog_band(p_player_id uuid)
returns public.package_age_band
language sql
stable
security definer
set search_path = public
as $$
  select public.catalog_band_from_team_age_band(t.age_band)
  from public.team_memberships m
  join public.teams t on t.id = m.team_id
  where m.player_id = p_player_id
    and m.status = 'active'
  order by (t.kind = 'age_squad') desc, m.updated_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_player_age_squad(
  p_player_id uuid,
  p_squad_id uuid,
  p_jersey_number integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind public.team_kind;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_player_id is null then
    raise exception 'player not found' using errcode = 'P0002';
  end if;
  if p_jersey_number is null or p_jersey_number < 1 or p_jersey_number > 99 then
    raise exception 'invalid jersey number' using errcode = '22023';
  end if;

  select t.kind into v_kind from public.teams t where t.id = p_squad_id;
  if not found then
    raise exception 'team not found' using errcode = 'P0002';
  end if;
  if v_kind is distinct from 'age_squad' then
    raise exception 'team kind must be age_squad' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'player not found' using errcode = 'P0002';
  end if;

  update public.team_memberships m
  set status = 'inactive',
      updated_by = auth.uid()
  from public.teams t
  where m.team_id = t.id
    and m.player_id = p_player_id
    and m.status = 'active'
    and t.kind = 'age_squad'
    and m.team_id is distinct from p_squad_id;

  insert into public.team_memberships (
    player_id, team_id, jersey_number, status, created_by, updated_by
  )
  values (
    p_player_id, p_squad_id, p_jersey_number, 'active', auth.uid(), auth.uid()
  )
  on conflict (player_id, team_id) do update
    set jersey_number = excluded.jersey_number,
        status = 'active',
        updated_by = auth.uid();
end;
$$;

create or replace function public.admin_set_player_competition_teams(
  p_player_id uuid,
  p_team_ids uuid[],
  p_jersey_numbers integer[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_len integer;
  v_i integer;
  v_team uuid;
  v_jersey integer;
  v_kind public.team_kind;
  v_layer text;
  v_layers text[] := array[]::text[];
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_player_id is null then
    raise exception 'player not found' using errcode = 'P0002';
  end if;
  if p_team_ids is null or p_jersey_numbers is null
     or coalesce(array_length(p_team_ids, 1), 0)
        is distinct from coalesce(array_length(p_jersey_numbers, 1), 0) then
    raise exception 'membership team and jersey arrays must match' using errcode = '22023';
  end if;

  v_len := coalesce(array_length(p_team_ids, 1), 0);
  if v_len > 2 then
    raise exception 'player already has 2 active memberships' using errcode = 'P0001';
  end if;
  if v_len > 0
     and (select count(distinct x) from unnest(p_team_ids) as x) <> v_len then
    raise exception 'duplicate team in memberships' using errcode = '22023';
  end if;

  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'player not found' using errcode = 'P0002';
  end if;

  for v_i in 1..greatest(v_len, 0) loop
    exit when v_len = 0;
    v_team := p_team_ids[v_i];
    v_jersey := p_jersey_numbers[v_i];
    if v_jersey is null or v_jersey < 1 or v_jersey > 99 then
      raise exception 'invalid jersey number' using errcode = '22023';
    end if;
    select t.kind, t.layer_key into v_kind, v_layer
    from public.teams t
    where t.id = v_team;
    if not found then
      raise exception 'team not found' using errcode = 'P0002';
    end if;
    if v_kind is distinct from 'competition_team' then
      raise exception 'team kind must be competition_team' using errcode = 'P0001';
    end if;
    if v_layer = any (v_layers) then
      raise exception 'player already has a competition team on this layer' using errcode = 'P0001';
    end if;
    v_layers := array_append(v_layers, v_layer);
  end loop;

  update public.team_memberships m
  set status = 'inactive',
      updated_by = auth.uid()
  from public.teams t
  where m.team_id = t.id
    and m.player_id = p_player_id
    and m.status = 'active'
    and t.kind = 'competition_team'
    and (v_len = 0 or not (m.team_id = any (p_team_ids)));

  for v_i in 1..greatest(v_len, 0) loop
    exit when v_len = 0;
    v_team := p_team_ids[v_i];
    v_jersey := p_jersey_numbers[v_i];
    insert into public.team_memberships (
      player_id, team_id, jersey_number, status, created_by, updated_by
    )
    values (
      p_player_id, v_team, v_jersey, 'active', auth.uid(), auth.uid()
    )
    on conflict (player_id, team_id) do update
      set jersey_number = excluded.jersey_number,
          status = 'active',
          updated_by = auth.uid();
  end loop;
end;
$$;

-- Backward-compatible name: now sets 隊伍 only (0–2). 梯隊 uses admin_set_player_age_squad.
create or replace function public.admin_set_player_memberships(
  p_player_id uuid,
  p_team_ids uuid[],
  p_jersey_numbers integer[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_set_player_competition_teams(
    p_player_id, p_team_ids, p_jersey_numbers
  );
end;
$$;

comment on function public.admin_set_player_age_squad(uuid, uuid, integer) is
  'Admin-only replace of a player’s current 梯隊 (exactly one). Dual-membership rules do not apply.';
comment on function public.admin_set_player_competition_teams(uuid, uuid[], integer[]) is
  'Admin-only replace of a player’s active 隊伍 (0–2). Enforces birth eligibility, continues_training on add, max 2, and unique layer_key.';
comment on function public.admin_set_player_memberships(uuid, uuid[], integer[]) is
  'Stage ST: alias of admin_set_player_competition_teams. PR #22 ladder-up is superseded.';
comment on table public.team_memberships is
  'Player membership on a 梯隊 or 隊伍. Exactly one active 梯隊. At most two active 隊伍; same layer_key forbidden; birth eligibility + continues_training on add. Jersey unique per team_id.';
comment on table public.teams is
  'Club units. kind=age_squad is 梯隊 (training roster band). kind=competition_team is 隊伍 (external match side).';

create or replace view public.age_squads as
  select * from public.teams where kind = 'age_squad';

create or replace view public.competition_teams as
  select * from public.teams where kind = 'competition_team';

grant select on public.age_squads to authenticated;
grant select on public.competition_teams to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.birth_age_label_from_completed_age(integer) from public, anon;
revoke all on function public.age_squad_band_from_completed_age(integer) from public, anon;
revoke all on function public.birth_age_label_from_birth_date(date, date) from public, anon;
revoke all on function public.age_squad_band_from_birth_date(date, date) from public, anon;
revoke all on function public.layer_key_from_age_band(public.age_band) from public, anon;
revoke all on function public.default_eligible_birth_ages(text) from public, anon;
revoke all on function public.session_team_kind_allowed(public.session_kind, public.team_kind) from public, anon;
revoke all on function public.enforce_session_unit_kind() from public, anon, authenticated;
revoke all on function public.enforce_team_membership_rules() from public, anon, authenticated;
revoke all on function public.admin_set_player_age_squad(uuid, uuid, integer) from public, anon;
revoke all on function public.admin_set_player_competition_teams(uuid, uuid[], integer[]) from public, anon;
revoke all on function public.admin_set_player_memberships(uuid, uuid[], integer[]) from public, anon;

grant execute on function public.birth_age_label_from_completed_age(integer) to authenticated;
grant execute on function public.age_squad_band_from_completed_age(integer) to authenticated;
grant execute on function public.birth_age_label_from_birth_date(date, date) to authenticated;
grant execute on function public.age_squad_band_from_birth_date(date, date) to authenticated;
grant execute on function public.layer_key_from_age_band(public.age_band) to authenticated;
grant execute on function public.default_eligible_birth_ages(text) to authenticated;
grant execute on function public.session_team_kind_allowed(public.session_kind, public.team_kind) to authenticated;
grant execute on function public.admin_set_player_age_squad(uuid, uuid, integer) to authenticated;
grant execute on function public.admin_set_player_competition_teams(uuid, uuid[], integer[]) to authenticated;
grant execute on function public.admin_set_player_memberships(uuid, uuid[], integer[]) to authenticated;
grant execute on function public.computed_age_band_from_birth_date(date, date) to authenticated;
grant execute on function public.player_team_catalog_band(uuid) to authenticated;
