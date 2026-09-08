-- Admin player jersey update + membership trigger self-upsert fix (staging only).
-- Do not run against production.
--
-- Bugs:
--   1. admin_set_player_* used INSERT ... ON CONFLICT (player_id, team_id).
--      BEFORE INSERT on enforce_team_membership_rules counted the existing
--      active 梯隊 / 隊伍 rows (new.id is a fresh uuid), so saving an already
--      assigned player failed with "already has an active age squad" and
--      blocked jersey edits including 99 → 91 on the same team.
--   2. ON CONFLICT only catches player+team uniqueness. A (team_id, jersey_number)
--      clash raised 23505 before the upsert, including the classic self-update
--      case when a second insert carried the player's current number.
--
-- Fix: UPDATE the existing (player_id, team_id) row in place, INSERT only when
-- missing. Trigger counts exclude the same team_id so upserts are not treated
-- as a second membership. Jersey unique violations re-raise as
-- 'jersey_number already used on this team'.
-- Idempotent. Safe to re-run.

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
      and m.id is distinct from new.id
      and m.team_id is distinct from new.team_id;
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
      and m.team_id is distinct from new.team_id
  ) then
    raise exception 'player already has a competition team on this layer' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_count
  from public.team_memberships m
  join public.teams t on t.id = m.team_id
  where m.player_id = new.player_id
    and m.status = 'active'
    and t.kind = 'competition_team'
    and m.id is distinct from new.id
    and m.team_id is distinct from new.team_id;
  if v_count >= 2 then
    raise exception 'player already has 2 active memberships' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

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

  begin
    update public.team_memberships
    set jersey_number = p_jersey_number,
        status = 'active',
        updated_by = auth.uid()
    where player_id = p_player_id
      and team_id = p_squad_id;

    if not found then
      insert into public.team_memberships (
        player_id, team_id, jersey_number, status, created_by, updated_by
      )
      values (
        p_player_id, p_squad_id, p_jersey_number, 'active', auth.uid(), auth.uid()
      );
    end if;
  exception
    when unique_violation then
      if sqlerrm ilike '%team_memberships_team_jersey%'
         or sqlerrm ilike '%(team_id, jersey_number)%' then
        raise exception 'jersey_number already used on this team' using errcode = '23505';
      end if;
      raise;
  end;
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
    begin
      update public.team_memberships
      set jersey_number = v_jersey,
          status = 'active',
          updated_by = auth.uid()
      where player_id = p_player_id
        and team_id = v_team;

      if not found then
        insert into public.team_memberships (
          player_id, team_id, jersey_number, status, created_by, updated_by
        )
        values (
          p_player_id, v_team, v_jersey, 'active', auth.uid(), auth.uid()
        );
      end if;
    exception
      when unique_violation then
        if sqlerrm ilike '%team_memberships_team_jersey%'
           or sqlerrm ilike '%(team_id, jersey_number)%' then
          raise exception 'jersey_number already used on this team' using errcode = '23505';
        end if;
        raise;
    end;
  end loop;
end;
$$;

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
  'Admin-only replace of a player’s current 梯隊 (exactly one). Updates jersey in place; does not treat the existing row as a second 梯隊.';
comment on function public.admin_set_player_competition_teams(uuid, uuid[], integer[]) is
  'Admin-only replace of a player’s active 隊伍 (0–2). Updates jersey in place so a player can change their own number when it is free on that team.';

revoke all on function public.enforce_team_membership_rules() from public, anon, authenticated;
revoke all on function public.admin_set_player_age_squad(uuid, uuid, integer) from public, anon;
revoke all on function public.admin_set_player_competition_teams(uuid, uuid[], integer[]) from public, anon;
revoke all on function public.admin_set_player_memberships(uuid, uuid[], integer[]) from public, anon;

grant execute on function public.admin_set_player_age_squad(uuid, uuid, integer) to authenticated;
grant execute on function public.admin_set_player_competition_teams(uuid, uuid[], integer[]) to authenticated;
grant execute on function public.admin_set_player_memberships(uuid, uuid[], integer[]) to authenticated;
