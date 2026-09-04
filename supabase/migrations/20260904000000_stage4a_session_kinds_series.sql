-- Stage 4A: session title, kind, series, weekly recurrence, soft-delete.
-- Apply to the staging project only. Do not run against production.
--
-- Extends Stage 4. Does not change auto-approve registration, capacity, notes, or Q&A.
-- Does not add payments, prepaid packages, attendance deduction, LINE, or push (Stage 4B).
--
-- Schema:
--   * session_kind: regular | special | cup | league
--   * session_series holds a shared title/kind for generated occurrences
--   * training_sessions gain title, kind, series_id, deleted_at, is_playoff
--   * Admin "delete" sets deleted_at (history + registrations + Q&A stay)
--   * Inactive status remains a separate hide-from-signup switch
--   * Parents still read sessions they already registered for after soft-delete
--
-- Recurrence (admin_create_session_series):
--   * special → exactly 1 occurrence
--   * regular / cup / league → weekly same weekday+time
--   * N weeks = N occurrences including the first
--   * end date XOR week count; neither or both is an error; max 52
--   * is_playoff is per occurrence (league only); no auto playoff bracket

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'session_kind'
      and n.nspname = 'public'
  ) then
    create type public.session_kind as enum ('regular', 'special', 'cup', 'league');
  end if;
end
$$;

create table if not exists public.session_series (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete restrict,
  title text not null,
  kind public.session_kind not null,
  location text,
  notes text,
  status public.org_status not null default 'active',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint session_series_title_length
    check (char_length(btrim(title)) >= 1 and char_length(title) <= 200),
  constraint session_series_location_length
    check (location is null or char_length(location) <= 200),
  constraint session_series_notes_length
    check (notes is null or char_length(notes) <= 1000)
);

alter table public.training_sessions
  add column if not exists title text;

alter table public.training_sessions
  add column if not exists kind public.session_kind;

alter table public.training_sessions
  add column if not exists series_id uuid;

alter table public.training_sessions
  add column if not exists deleted_at timestamptz;

alter table public.training_sessions
  add column if not exists is_playoff boolean;

update public.training_sessions s
set title = left(
  coalesce(
    (select t.name from public.teams t where t.id = s.team_id),
    'Session'
  ) || ' ' || to_char((s.starts_at at time zone 'Asia/Taipei'), 'YYYY-MM-DD'),
  200
)
where s.title is null or btrim(s.title) = '';

update public.training_sessions
set kind = 'regular'
where kind is null;

update public.training_sessions
set is_playoff = false
where is_playoff is null;

alter table public.training_sessions
  alter column title set not null;

alter table public.training_sessions
  alter column kind set not null;

alter table public.training_sessions
  alter column kind set default 'regular';

alter table public.training_sessions
  alter column is_playoff set not null;

alter table public.training_sessions
  alter column is_playoff set default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_sessions_series_id_fkey'
  ) then
    alter table public.training_sessions
      add constraint training_sessions_series_id_fkey
      foreign key (series_id) references public.session_series (id) on delete restrict;
  end if;
end
$$;

alter table public.training_sessions
  drop constraint if exists training_sessions_title_length;
alter table public.training_sessions
  add constraint training_sessions_title_length
  check (char_length(btrim(title)) >= 1 and char_length(title) <= 200);

alter table public.training_sessions
  drop constraint if exists training_sessions_playoff_league_only;
alter table public.training_sessions
  add constraint training_sessions_playoff_league_only
  check (is_playoff = false or kind = 'league');

create index if not exists training_sessions_series_id_idx
  on public.training_sessions (series_id);

create index if not exists training_sessions_kind_idx
  on public.training_sessions (kind);

create index if not exists training_sessions_deleted_at_idx
  on public.training_sessions (deleted_at);

create index if not exists session_series_team_id_idx
  on public.session_series (team_id);

create index if not exists session_series_deleted_at_idx
  on public.session_series (deleted_at);

comment on type public.session_kind is
  'regular = weekly training; special = one-off; cup = short cup series; league = regular season (playoff flag is per occurrence).';
comment on table public.session_series is
  'Admin-created series. Occurrences live on training_sessions. Soft-delete via deleted_at. No auto playoff bracket.';
comment on column public.training_sessions.title is
  'Required display title. Parents see this on signup lists.';
comment on column public.training_sessions.kind is
  'Copied from the series at create time. Playoff flag is only meaningful when kind = league.';
comment on column public.training_sessions.deleted_at is
  'Admin soft-delete. Hidden from new parent signup. Registrations and Q&A stay.';
comment on column public.training_sessions.is_playoff is
  'Per-occurrence league playoff marker. Not auto-generated.';

grant usage on type public.session_kind to authenticated;

drop trigger if exists session_series_set_updated_at on public.session_series;
create trigger session_series_set_updated_at
  before update on public.session_series
  for each row
  execute function public.set_updated_at();

drop trigger if exists session_series_set_actor_columns on public.session_series;
create trigger session_series_set_actor_columns
  before insert or update on public.session_series
  for each row
  execute function public.set_actor_columns();

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
          and public.guardian_can_read_team(s.team_id)
        )
        or exists (
          select 1
          from public.session_registrations r
          where r.session_id = s.id
            and public.is_approved_guardian_for_player(r.player_id)
        )
      )
  );
$$;

create or replace function public.register_player_for_session(
  p_session_id uuid,
  p_player_id uuid,
  p_parent_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  session_team uuid;
  session_status public.org_status;
  session_deleted timestamptz;
  note text;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not public.is_approved_guardian_for_player(p_player_id) then
    raise exception 'not an approved guardian for this player' using errcode = '42501';
  end if;

  select s.team_id, s.status, s.deleted_at
    into session_team, session_status, session_deleted
  from public.training_sessions s
  where s.id = p_session_id;

  if session_team is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  if session_status is distinct from 'active' or session_deleted is not null then
    raise exception 'session is not active' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.team_memberships m
    where m.player_id = p_player_id
      and m.team_id = session_team
      and m.status = 'active'
  ) then
    raise exception 'player is not on this session team' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.session_registrations r
    where r.session_id = p_session_id
      and r.player_id = p_player_id
      and r.status = 'registered'
  ) then
    raise exception 'already registered' using errcode = '23505';
  end if;

  note := nullif(btrim(coalesce(p_parent_note, '')), '');
  if note is not null then
    note := left(note, 1000);
  end if;

  insert into public.session_registrations (
    session_id,
    player_id,
    guardian_user_id,
    status,
    parent_note,
    created_by,
    updated_by
  )
  values (
    p_session_id,
    p_player_id,
    auth.uid(),
    'registered',
    note,
    auth.uid(),
    auth.uid()
  )
  returning id into new_id;

  return new_id;
exception
  when unique_violation then
    raise exception 'already registered' using errcode = '23505';
end;
$$;

create or replace function public.admin_create_session_series(
  p_team_id uuid,
  p_title text,
  p_kind public.session_kind,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location text default null,
  p_notes text default null,
  p_status public.org_status default 'active',
  p_until_date date default null,
  p_week_count integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_location text;
  v_notes text;
  v_status public.org_status;
  v_series_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_count integer := 0;
  v_first_date date;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_title := btrim(coalesce(p_title, ''));
  if char_length(v_title) < 1 then
    raise exception 'title required' using errcode = '22023';
  end if;
  v_title := left(v_title, 200);

  if p_kind is null then
    raise exception 'invalid session kind' using errcode = '22023';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'end time must be after start time' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.teams where id = p_team_id) then
    raise exception 'team not found' using errcode = 'P0002';
  end if;

  v_location := nullif(btrim(coalesce(p_location, '')), '');
  if v_location is not null then
    v_location := left(v_location, 200);
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null then
    v_notes := left(v_notes, 1000);
  end if;

  v_status := coalesce(p_status, 'active');

  if p_kind = 'special' then
    v_count := 1;
  else
    if p_until_date is not null and p_week_count is not null then
      raise exception 'recurrence cannot use both end date and week count' using errcode = '22023';
    end if;
    if p_until_date is null and p_week_count is null then
      raise exception 'recurrence requires an end date or a week count' using errcode = '22023';
    end if;

    if p_week_count is not null then
      if p_week_count < 1 or p_week_count > 52 then
        raise exception 'invalid week count' using errcode = '22023';
      end if;
      v_count := p_week_count;
    else
      v_first_date := (p_starts_at at time zone 'Asia/Taipei')::date;
      if p_until_date < v_first_date then
        raise exception 'until date is before the first start' using errcode = '22023';
      end if;

      v_start := p_starts_at;
      while (v_start at time zone 'Asia/Taipei')::date <= p_until_date loop
        v_count := v_count + 1;
        if v_count > 52 then
          raise exception 'too many occurrences' using errcode = 'P0001';
        end if;
        v_start := v_start + interval '7 days';
      end loop;

      if v_count < 1 then
        raise exception 'until date is before the first start' using errcode = '22023';
      end if;
    end if;
  end if;

  insert into public.session_series (
    team_id,
    title,
    kind,
    location,
    notes,
    status,
    created_by,
    updated_by
  )
  values (
    p_team_id,
    v_title,
    p_kind,
    v_location,
    v_notes,
    v_status,
    auth.uid(),
    auth.uid()
  )
  returning id into v_series_id;

  for i in 0 .. v_count - 1 loop
    insert into public.training_sessions (
      team_id,
      title,
      kind,
      series_id,
      starts_at,
      ends_at,
      location,
      notes,
      status,
      is_playoff,
      created_by,
      updated_by
    )
    values (
      p_team_id,
      v_title,
      p_kind,
      v_series_id,
      p_starts_at + (i * interval '7 days'),
      p_ends_at + (i * interval '7 days'),
      v_location,
      v_notes,
      v_status,
      false,
      auth.uid(),
      auth.uid()
    );
  end loop;

  return v_series_id;
end;
$$;

create or replace function public.admin_soft_delete_session(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (select 1 from public.training_sessions where id = p_session_id) then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  update public.training_sessions
  set
    deleted_at = coalesce(deleted_at, now()),
    updated_by = auth.uid()
  where id = p_session_id;

  return p_session_id;
end;
$$;

create or replace function public.admin_soft_delete_session_series(p_series_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (select 1 from public.session_series where id = p_series_id) then
    raise exception 'session series not found' using errcode = 'P0002';
  end if;

  update public.session_series
  set
    deleted_at = coalesce(deleted_at, now()),
    updated_by = auth.uid()
  where id = p_series_id;

  update public.training_sessions
  set
    deleted_at = coalesce(deleted_at, now()),
    updated_by = auth.uid()
  where series_id = p_series_id
    and deleted_at is null;

  return p_series_id;
end;
$$;

create or replace function public.admin_delete_team(p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  active_memberships integer;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (select 1 from public.teams where id = p_team_id) then
    raise exception 'team not found' using errcode = 'P0002';
  end if;

  select count(*) into active_memberships
  from public.team_memberships
  where team_id = p_team_id
    and status = 'active';

  if active_memberships > 0 then
    raise exception
      'team has active memberships; end or inactivate memberships first, or deactivate the team instead'
      using errcode = 'P0001';
  end if;

  delete from public.team_memberships
  where team_id = p_team_id
    and status is distinct from 'active';

  delete from public.coach_team_assignments
  where team_id = p_team_id;

  delete from public.training_sessions
  where team_id = p_team_id;

  delete from public.session_series
  where team_id = p_team_id;

  delete from public.teams
  where id = p_team_id;

  if not found then
    raise exception 'team not found' using errcode = 'P0002';
  end if;

  return p_team_id;
end;
$$;

comment on function public.guardian_can_read_session(uuid) is
  'Parents may read active non-deleted sessions on teams of approved children, or any session they already registered for (including later soft-deleted).';
comment on function public.register_player_for_session(uuid, uuid, text) is
  'Approved guardian registers a linked child on an active, non-deleted session. Auto-registered. Re-register after cancel is allowed while the session stays active.';
comment on function public.admin_create_session_series(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, public.org_status, date, integer) is
  'Admin-only. Creates a series and weekly occurrences (special = 1). End date XOR week count; max 52. Does not generate playoff brackets.';
comment on function public.admin_soft_delete_session(uuid) is
  'Admin-only. Sets deleted_at. Does not remove registrations or Q&A.';
comment on function public.admin_soft_delete_session_series(uuid) is
  'Admin-only. Soft-deletes the series and all of its occurrences.';
comment on function public.admin_delete_team(uuid) is
  'Admin-only hard delete. Blocks only while active team_memberships exist. Removes inactive memberships, coach assignments, training sessions, and session series in the same transaction. Does not delete players.';

revoke all on function public.guardian_can_read_session(uuid) from public, anon;
revoke all on function public.register_player_for_session(uuid, uuid, text) from public, anon;
revoke all on function public.admin_create_session_series(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, public.org_status, date, integer) from public, anon;
revoke all on function public.admin_soft_delete_session(uuid) from public, anon;
revoke all on function public.admin_soft_delete_session_series(uuid) from public, anon;
revoke all on function public.admin_delete_team(uuid) from public, anon;

grant execute on function public.guardian_can_read_session(uuid) to authenticated;
grant execute on function public.register_player_for_session(uuid, uuid, text) to authenticated;
grant execute on function public.admin_create_session_series(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, public.org_status, date, integer) to authenticated;
grant execute on function public.admin_soft_delete_session(uuid) to authenticated;
grant execute on function public.admin_soft_delete_session_series(uuid) to authenticated;
grant execute on function public.admin_delete_team(uuid) to authenticated;

alter table public.session_series enable row level security;

revoke all on table public.session_series from public, anon;
revoke delete on table public.training_sessions from public, anon, authenticated;

grant select, insert, update on table public.training_sessions to authenticated;
grant select, insert, update on table public.session_series to authenticated;

drop policy if exists training_sessions_delete_admin on public.training_sessions;

drop policy if exists session_series_select_admin on public.session_series;
create policy session_series_select_admin
  on public.session_series
  for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists session_series_select_assigned_coach on public.session_series;
create policy session_series_select_assigned_coach
  on public.session_series
  for select
  to authenticated
  using (public.is_assigned_coach_for_team(team_id));

drop policy if exists session_series_insert_admin on public.session_series;
create policy session_series_insert_admin
  on public.session_series
  for insert
  to authenticated
  with check (public.has_role('admin'));

drop policy if exists session_series_update_admin on public.session_series;
create policy session_series_update_admin
  on public.session_series
  for update
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));
