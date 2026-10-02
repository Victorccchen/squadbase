-- Phase 1 PR-05: primary 梯隊 + one cross 梯隊 (D10, D10-1). Staging only.
-- Do not run against production.
--
-- A player keeps exactly one primary 梯隊 (band must match the birth date, and
-- prices follow it). Admin may add one cross 梯隊 (跨上) on another age squad;
-- no birth check, the coach and admin decide. Cross rows are ordinary
-- team_memberships, so session registration, attendance and coach reads that
-- match on team_id accept them without changes. Debits keep following the
-- session's team band.
--
-- Jersey numbers stay required (column is NOT NULL, unique per team). The cross
-- RPC defaults to the player's primary jersey when none is given.

-- 1. Column + backfill ---------------------------------------------------------

alter table public.team_memberships
  add column if not exists squad_role text;

alter table public.team_memberships
  drop constraint if exists team_memberships_squad_role_check;
alter table public.team_memberships
  add constraint team_memberships_squad_role_check
  check (squad_role is null or squad_role in ('primary', 'cross'));

-- Existing 梯隊 rows are primary (the old trigger allowed one active per player).
-- Trigger is bypassed for the backfill so stale rows (old birth bands) still update.
alter table public.team_memberships disable trigger team_memberships_enforce_rules;
update public.team_memberships m
set squad_role = 'primary'
from public.teams t
where t.id = m.team_id
  and t.kind = 'age_squad'
  and m.squad_role is null;
alter table public.team_memberships enable trigger team_memberships_enforce_rules;

create unique index if not exists team_memberships_one_active_primary_idx
  on public.team_memberships (player_id)
  where status = 'active' and squad_role = 'primary';
create unique index if not exists team_memberships_one_active_cross_idx
  on public.team_memberships (player_id)
  where status = 'active' and squad_role = 'cross';

comment on column public.team_memberships.squad_role is
  'age_squad rows: primary (one active, band from birth, sets price) or cross (one active, 跨上). Null for 隊伍.';

-- 2. Membership rules ----------------------------------------------------------

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
  select t.kind, t.layer_key, t.eligible_birth_ages, t.age_band
    into v_kind, v_layer, v_eligible, v_team_band
  from public.teams t
  where t.id = new.team_id;
  if not found then
    raise exception 'team not found' using errcode = 'P0002';
  end if;

  -- squad_role only means something on 梯隊; default 梯隊 rows to primary.
  if v_kind = 'age_squad' then
    new.squad_role := coalesce(new.squad_role, 'primary');
  else
    new.squad_role := null;
  end if;

  if new.status is distinct from 'active' then
    return new;
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

  if v_kind = 'age_squad' and new.squad_role = 'primary' then
    if v_team_band is distinct from v_squad then
      raise exception 'age squad band not allowed for this player' using errcode = 'P0001';
    end if;
    select count(*)::integer into v_count
    from public.team_memberships m
    where m.player_id = new.player_id
      and m.status = 'active'
      and m.squad_role = 'primary'
      and m.id is distinct from new.id
      and m.team_id is distinct from new.team_id;
    if v_count >= 1 then
      raise exception 'player already has an active age squad' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if v_kind = 'age_squad' then
    -- cross: no birth check; needs an active primary on another team (the same
    -- team cannot be both: unique (player_id, team_id)); at most one cross.
    if not exists (
      select 1
      from public.team_memberships m
      where m.player_id = new.player_id
        and m.status = 'active'
        and m.squad_role = 'primary'
        and m.team_id is distinct from new.team_id
    ) then
      raise exception 'cross squad requires an active primary squad' using errcode = 'P0001';
    end if;
    select count(*)::integer into v_count
    from public.team_memberships m
    where m.player_id = new.player_id
      and m.status = 'active'
      and m.squad_role = 'cross'
      and m.id is distinct from new.id
      and m.team_id is distinct from new.team_id;
    if v_count >= 1 then
      raise exception 'player already has an active cross squad' using errcode = 'P0001';
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

-- 3. Price band follows the primary 梯隊 only ----------------------------------

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
    and m.squad_role is distinct from 'cross'
  order by (m.squad_role = 'primary') desc nulls last, m.updated_at desc
  limit 1;
$$;

-- 4. Parents read sessions of teams their child is on now ----------------------
-- Before: any membership row, active or not, kept a team's sessions visible.
-- Now: an active membership (primary, cross or 隊伍), or the child registered
-- for or attended that session. Removing a cross 梯隊 hides its future sessions;
-- past attendance stays readable.

create or replace function public.guardian_has_active_player_on_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships m
    where m.team_id = p_team_id
      and m.status = 'active'
      and public.is_approved_guardian_for_player(m.player_id)
  );
$$;

create or replace function public.guardian_can_read_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.training_sessions s
    where s.id = p_session_id
      and (
        (
          s.status = 'active'
          and s.deleted_at is null
          and public.guardian_has_active_player_on_team(s.team_id)
        )
        or exists (
          select 1
          from public.session_registrations r
          where r.session_id = s.id
            and public.is_approved_guardian_for_player(r.player_id)
        )
        or exists (
          select 1
          from public.session_attendance a
          where a.session_id = s.id
            and public.is_approved_guardian_for_player(a.player_id)
        )
      )
  );
$$;

-- 5. Admin RPCs -----------------------------------------------------------------

-- Primary 梯隊: same contract as before, but leaves the cross 梯隊 alone. Picking
-- the current cross team as the new primary promotes that row.
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
  where m.player_id = p_player_id
    and m.status = 'active'
    and m.squad_role = 'primary'
    and m.team_id is distinct from p_squad_id;

  begin
    update public.team_memberships
    set jersey_number = p_jersey_number,
        status = 'active',
        squad_role = 'primary',
        updated_by = auth.uid()
    where player_id = p_player_id
      and team_id = p_squad_id;

    if not found then
      insert into public.team_memberships (
        player_id, team_id, jersey_number, status, squad_role, created_by, updated_by
      )
      values (
        p_player_id, p_squad_id, p_jersey_number, 'active', 'primary', auth.uid(), auth.uid()
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

-- Cross 梯隊: set, change or clear (p_team_id null). Jersey defaults to the
-- primary jersey. Audited; attendance history on a removed cross team stays.
create or replace function public.admin_set_cross_squad(
  p_player_id uuid,
  p_team_id uuid,
  p_jersey_number integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind public.team_kind;
  v_team_status public.org_status;
  v_primary public.team_memberships%rowtype;
  v_before jsonb;
  v_jersey integer;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_player_id is null or not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'player not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object('team_id', m.team_id, 'jersey_number', m.jersey_number)
    into v_before
  from public.team_memberships m
  where m.player_id = p_player_id
    and m.status = 'active'
    and m.squad_role = 'cross';

  if p_team_id is null then
    update public.team_memberships
    set status = 'inactive',
        updated_by = auth.uid()
    where player_id = p_player_id
      and status = 'active'
      and squad_role = 'cross';
    if v_before is not null then
      perform public.write_audit('team_membership.cross_clear', 'player', p_player_id, v_before, null);
    end if;
    return;
  end if;

  select t.kind, t.status into v_kind, v_team_status from public.teams t where t.id = p_team_id;
  if not found then
    raise exception 'team not found' using errcode = 'P0002';
  end if;
  if v_kind is distinct from 'age_squad' then
    raise exception 'team kind must be age_squad' using errcode = 'P0001';
  end if;
  if v_team_status is distinct from 'active' then
    raise exception 'team is not active' using errcode = 'P0001';
  end if;

  select * into v_primary
  from public.team_memberships m
  where m.player_id = p_player_id
    and m.status = 'active'
    and m.squad_role = 'primary';
  if v_primary.id is null then
    raise exception 'cross squad requires an active primary squad' using errcode = 'P0001';
  end if;
  if v_primary.team_id = p_team_id then
    raise exception 'cross squad must differ from primary squad' using errcode = 'P0001';
  end if;

  v_jersey := coalesce(p_jersey_number, v_primary.jersey_number);
  if v_jersey < 1 or v_jersey > 99 then
    raise exception 'invalid jersey number' using errcode = '22023';
  end if;

  update public.team_memberships
  set status = 'inactive',
      updated_by = auth.uid()
  where player_id = p_player_id
    and status = 'active'
    and squad_role = 'cross'
    and team_id <> p_team_id;

  begin
    update public.team_memberships
    set jersey_number = v_jersey,
        status = 'active',
        squad_role = 'cross',
        updated_by = auth.uid()
    where player_id = p_player_id
      and team_id = p_team_id;

    if not found then
      insert into public.team_memberships (
        player_id, team_id, jersey_number, status, squad_role, created_by, updated_by
      )
      values (
        p_player_id, p_team_id, v_jersey, 'active', 'cross', auth.uid(), auth.uid()
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

  perform public.write_audit(
    'team_membership.cross_set', 'player', p_player_id, v_before,
    jsonb_build_object('team_id', p_team_id, 'jersey_number', v_jersey)
  );
end;
$$;

comment on function public.admin_set_player_age_squad(uuid, uuid, integer) is
  'Admin-only replace of a player’s primary 梯隊. Leaves the cross 梯隊 alone; choosing the cross team promotes it.';
comment on function public.admin_set_cross_squad(uuid, uuid, integer) is
  'Admin-only set or clear (null team) of a player’s one cross 梯隊 (跨上). Jersey defaults to the primary jersey. Audited.';
comment on function public.guardian_can_read_session(uuid) is
  'Approved guardian: active session on a team where the child has an active membership, or a session the child registered for or attended.';

revoke all on function public.enforce_team_membership_rules() from public, anon, authenticated;
revoke all on function public.player_team_catalog_band(uuid) from public, anon;
revoke all on function public.guardian_has_active_player_on_team(uuid) from public, anon;
revoke all on function public.guardian_can_read_session(uuid) from public, anon;
revoke all on function public.admin_set_player_age_squad(uuid, uuid, integer) from public, anon;
revoke all on function public.admin_set_cross_squad(uuid, uuid, integer) from public, anon;

grant execute on function public.player_team_catalog_band(uuid) to authenticated;
grant execute on function public.guardian_has_active_player_on_team(uuid) to authenticated;
grant execute on function public.guardian_can_read_session(uuid) to authenticated;
grant execute on function public.admin_set_player_age_squad(uuid, uuid, integer) to authenticated;
grant execute on function public.admin_set_cross_squad(uuid, uuid, integer) to authenticated;
