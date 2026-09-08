-- Multi-team membership rules (staging only). Do not run against production.
-- Product lock Victor 2026-09-08:
--   * At most 2 active team_memberships per player.
--   * Team age_band must be the player’s natural computed band from
--     birth_date (15 Aug / Asia/Taipei season start) or exactly one step
--     higher on the computed ladder:
--       U6 → U8 → U10 → U12 → U15 → U18 → senior
--     Never lower. U9 and U11 are not in public.age_band; play-up from U8
--     is U10, from U10 is U12. `reserve` is a team classification and is
--     not a step on this ladder (not same-band, not one-step-up).
-- Jersey uniqueness remains UNIQUE (team_id, jersey_number).
-- Parent signup / debit math is unchanged: still approved guardian plus
-- an active membership on that session’s team.
-- Idempotent. Safe to re-run.

create or replace function public.season_start_on(p_as_of date)
returns date
language sql
immutable
set search_path = public
as $$
  select case
    when p_as_of >= make_date(extract(year from p_as_of)::integer, 8, 15)
      then make_date(extract(year from p_as_of)::integer, 8, 15)
    else make_date(extract(year from p_as_of)::integer - 1, 8, 15)
  end;
$$;

create or replace function public.computed_age_band_from_birth_date(
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
  if v_age < 6 then
    return 'U6';
  end if;
  if v_age < 8 then
    return 'U8';
  end if;
  if v_age < 10 then
    return 'U10';
  end if;
  if v_age < 12 then
    return 'U12';
  end if;
  if v_age < 15 then
    return 'U15';
  end if;
  if v_age < 18 then
    return 'U18';
  end if;
  return 'senior';
end;
$$;

create or replace function public.age_band_ladder_rank(p_band public.age_band)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_band
    when 'U6' then 0
    when 'U8' then 1
    when 'U10' then 2
    when 'U12' then 3
    when 'U15' then 4
    when 'U18' then 5
    when 'senior' then 6
    else null
  end;
$$;

create or replace function public.next_higher_computed_age_band(p_band public.age_band)
returns public.age_band
language sql
immutable
set search_path = public
as $$
  select case p_band
    when 'U6' then 'U8'::public.age_band
    when 'U8' then 'U10'::public.age_band
    when 'U10' then 'U12'::public.age_band
    when 'U12' then 'U15'::public.age_band
    when 'U15' then 'U18'::public.age_band
    when 'U18' then 'senior'::public.age_band
    else null
  end;
$$;

create or replace function public.team_age_band_allowed_for_player(
  p_natural public.age_band,
  p_team public.age_band
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    public.age_band_ladder_rank(p_natural) is not null
    and public.age_band_ladder_rank(p_team) is not null
    and public.age_band_ladder_rank(p_team)
      between public.age_band_ladder_rank(p_natural)
          and public.age_band_ladder_rank(p_natural) + 1;
$$;

create or replace function public.club_today()
returns date
language sql
stable
set search_path = public
as $$
  select (timezone('Asia/Taipei', now()))::date;
$$;

create or replace function public.enforce_team_membership_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
  v_birth date;
  v_natural public.age_band;
  v_team_band public.age_band;
begin
  if new.status is distinct from 'active' then
    return new;
  end if;

  select birth_date into v_birth
  from public.players
  where id = new.player_id
  for update;
  if not found then
    raise exception 'player not found' using errcode = 'P0002';
  end if;

  select t.age_band into v_team_band
  from public.teams t
  where t.id = new.team_id;
  if not found then
    raise exception 'team not found' using errcode = 'P0002';
  end if;

  v_natural := public.computed_age_band_from_birth_date(v_birth, public.club_today());
  if not public.team_age_band_allowed_for_player(v_natural, v_team_band) then
    raise exception 'team age band not allowed for this player' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_count
  from public.team_memberships m
  where m.player_id = new.player_id
    and m.status = 'active'
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
declare
  v_len integer;
  v_i integer;
  v_team uuid;
  v_jersey integer;
  v_birth date;
  v_natural public.age_band;
  v_team_band public.age_band;
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
  if v_len < 1 then
    raise exception 'at least one membership required' using errcode = '22023';
  end if;
  if v_len > 2 then
    raise exception 'player already has 2 active memberships' using errcode = 'P0001';
  end if;
  if (select count(distinct x) from unnest(p_team_ids) as x) <> v_len then
    raise exception 'duplicate team in memberships' using errcode = '22023';
  end if;

  select birth_date into v_birth
  from public.players
  where id = p_player_id
  for update;
  if not found then
    raise exception 'player not found' using errcode = 'P0002';
  end if;
  v_natural := public.computed_age_band_from_birth_date(v_birth, public.club_today());

  for v_i in 1..v_len loop
    v_team := p_team_ids[v_i];
    v_jersey := p_jersey_numbers[v_i];
    if v_jersey is null or v_jersey < 1 or v_jersey > 99 then
      raise exception 'invalid jersey number' using errcode = '22023';
    end if;
    select t.age_band into v_team_band
    from public.teams t
    where t.id = v_team;
    if not found then
      raise exception 'team not found' using errcode = 'P0002';
    end if;
    if not public.team_age_band_allowed_for_player(v_natural, v_team_band) then
      raise exception 'team age band not allowed for this player' using errcode = 'P0001';
    end if;
  end loop;

  update public.team_memberships
  set status = 'inactive',
      updated_by = auth.uid()
  where player_id = p_player_id
    and status = 'active'
    and not (team_id = any (p_team_ids));

  for v_i in 1..v_len loop
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

comment on function public.admin_set_player_memberships(uuid, uuid[], integer[]) is
  'Admin-only replace of a player’s active memberships (1–2 teams). Enforces band-up and the two-active cap. Inactive extra rows are kept for jersey history.';

comment on table public.team_memberships is
  'Player–team membership. At most 2 active rows per player. Team age_band must be the player’s natural computed band or exactly one step higher on U6→U8→U10→U12→U15→U18→senior (no U9/U11; reserve is not on this ladder). Jersey numbers are unique per team, not globally.';

revoke all on function public.season_start_on(date) from public, anon;
revoke all on function public.computed_age_band_from_birth_date(date, date) from public, anon;
revoke all on function public.age_band_ladder_rank(public.age_band) from public, anon;
revoke all on function public.next_higher_computed_age_band(public.age_band) from public, anon;
revoke all on function public.team_age_band_allowed_for_player(public.age_band, public.age_band) from public, anon;
revoke all on function public.club_today() from public, anon;
revoke all on function public.enforce_team_membership_rules() from public, anon, authenticated;
revoke all on function public.admin_set_player_memberships(uuid, uuid[], integer[]) from public, anon;

grant execute on function public.season_start_on(date) to authenticated;
grant execute on function public.computed_age_band_from_birth_date(date, date) to authenticated;
grant execute on function public.age_band_ladder_rank(public.age_band) to authenticated;
grant execute on function public.next_higher_computed_age_band(public.age_band) to authenticated;
grant execute on function public.team_age_band_allowed_for_player(public.age_band, public.age_band) to authenticated;
grant execute on function public.club_today() to authenticated;
grant execute on function public.admin_set_player_memberships(uuid, uuid[], integer[]) to authenticated;
