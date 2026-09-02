-- Stage 2: organization master data (teams, players, coaches, assignments).
-- Apply to the staging project only. Do not run against production.
--
-- Schema choice: team_memberships is the source of truth for “which team”
-- and jersey number. UNIQUE (team_id, jersey_number) enforces per-team
-- uniqueness (the same number may exist on another team). Players do not
-- store a primary team_id. The Stage 2 admin UI maintains at most one
-- membership row per player; the table allows more than one for later stages.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'age_band'
      and n.nspname = 'public'
  ) then
    create type public.age_band as enum (
      'U6',
      'U8',
      'U10',
      'U12',
      'U15',
      'U18',
      'reserve',
      'senior'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'org_status'
      and n.nspname = 'public'
  ) then
    create type public.org_status as enum ('active', 'inactive');
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_actor_columns()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by = coalesce(new.created_by, auth.uid());
    new.updated_by = coalesce(new.updated_by, auth.uid());
  else
    new.updated_by = coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end;
$$;

create or replace function public.has_role(check_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = check_role
  );
$$;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  age_band public.age_band not null,
  status public.org_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint teams_name_not_blank check (char_length(trim(name)) > 0)
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name_zh text not null,
  name_en text not null,
  name_ja text not null,
  birth_date date not null,
  status public.org_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint players_name_zh_not_blank check (char_length(trim(name_zh)) > 0),
  constraint players_name_en_not_blank check (char_length(trim(name_en)) > 0),
  constraint players_name_ja_not_blank check (char_length(trim(name_ja)) > 0)
);

create table if not exists public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete restrict,
  jersey_number integer not null,
  status public.org_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint team_memberships_player_team_key unique (player_id, team_id),
  constraint team_memberships_team_jersey_key unique (team_id, jersey_number),
  constraint team_memberships_jersey_range check (
    jersey_number >= 1 and jersey_number <= 99
  )
);

create table if not exists public.coaches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  status public.org_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

create table if not exists public.coach_team_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint coach_team_assignments_coach_team_key unique (coach_id, team_id)
);

create index if not exists teams_status_idx on public.teams (status);
create index if not exists players_status_idx on public.players (status);
create index if not exists team_memberships_team_id_idx on public.team_memberships (team_id);
create index if not exists team_memberships_player_id_idx on public.team_memberships (player_id);
create index if not exists coaches_status_idx on public.coaches (status);
create index if not exists coach_team_assignments_team_id_idx on public.coach_team_assignments (team_id);

comment on type public.age_band is
  'Youth bands U6–U18 are computed from DOB vs the 15 Aug season start. reserve is a team classification, not a DOB result. senior is 18+.';
comment on table public.teams is
  'Training squads. age_band is the squad’s intended band; player age_band is computed in the app, not stored.';
comment on table public.players is
  'Player master records. Names are locale-specific; birth_date is PII and is not readable by anon or parents in Stage 2.';
comment on table public.team_memberships is
  'Player–team membership. Jersey numbers are unique per team, not globally.';
comment on table public.coaches is
  'Coach records linked 1:1 to profiles. Create the auth user (login once) before an admin links them here.';
comment on table public.coach_team_assignments is
  'Which squads a coach may read. Writes are admin-only.';

drop trigger if exists teams_set_updated_at on public.teams;
create trigger teams_set_updated_at
  before update on public.teams
  for each row
  execute function public.set_updated_at();

drop trigger if exists teams_set_actor_columns on public.teams;
create trigger teams_set_actor_columns
  before insert or update on public.teams
  for each row
  execute function public.set_actor_columns();

drop trigger if exists players_set_updated_at on public.players;
create trigger players_set_updated_at
  before update on public.players
  for each row
  execute function public.set_updated_at();

drop trigger if exists players_set_actor_columns on public.players;
create trigger players_set_actor_columns
  before insert or update on public.players
  for each row
  execute function public.set_actor_columns();

drop trigger if exists team_memberships_set_updated_at on public.team_memberships;
create trigger team_memberships_set_updated_at
  before update on public.team_memberships
  for each row
  execute function public.set_updated_at();

drop trigger if exists team_memberships_set_actor_columns on public.team_memberships;
create trigger team_memberships_set_actor_columns
  before insert or update on public.team_memberships
  for each row
  execute function public.set_actor_columns();

drop trigger if exists coaches_set_updated_at on public.coaches;
create trigger coaches_set_updated_at
  before update on public.coaches
  for each row
  execute function public.set_updated_at();

drop trigger if exists coaches_set_actor_columns on public.coaches;
create trigger coaches_set_actor_columns
  before insert or update on public.coaches
  for each row
  execute function public.set_actor_columns();

drop trigger if exists coach_team_assignments_set_updated_at on public.coach_team_assignments;
create trigger coach_team_assignments_set_updated_at
  before update on public.coach_team_assignments
  for each row
  execute function public.set_updated_at();

drop trigger if exists coach_team_assignments_set_actor_columns on public.coach_team_assignments;
create trigger coach_team_assignments_set_actor_columns
  before insert or update on public.coach_team_assignments
  for each row
  execute function public.set_actor_columns();

create or replace function public.current_coach_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.coaches c
  where c.profile_id = auth.uid()
    and c.status = 'active'
  limit 1;
$$;

create or replace function public.is_assigned_coach_for_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coach_team_assignments a
    where a.coach_id = public.current_coach_id()
      and a.team_id = p_team_id
  );
$$;

create or replace function public.coach_can_read_player(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships m
    where m.player_id = p_player_id
      and public.is_assigned_coach_for_team(m.team_id)
  );
$$;

create or replace function public.admin_link_coach(target_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles where id = target_profile_id
  ) then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  insert into public.coaches (profile_id, status, created_by, updated_by)
  values (target_profile_id, 'active', auth.uid(), auth.uid())
  on conflict (profile_id) do update
    set status = 'active',
        updated_by = auth.uid()
  returning id into new_id;

  insert into public.user_roles (user_id, role, created_by, updated_by)
  values (target_profile_id, 'coach'::public.app_role, auth.uid(), auth.uid())
  on conflict (user_id, role) do nothing;

  return new_id;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.set_actor_columns() from public, anon, authenticated;
revoke all on function public.has_role(public.app_role) from public, anon;
revoke all on function public.current_coach_id() from public, anon;
revoke all on function public.is_assigned_coach_for_team(uuid) from public, anon;
revoke all on function public.coach_can_read_player(uuid) from public, anon;
revoke all on function public.admin_link_coach(uuid) from public, anon;

grant execute on function public.has_role(public.app_role) to authenticated;
grant execute on function public.current_coach_id() to authenticated;
grant execute on function public.is_assigned_coach_for_team(uuid) to authenticated;
grant execute on function public.coach_can_read_player(uuid) to authenticated;
grant execute on function public.admin_link_coach(uuid) to authenticated;

alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.team_memberships enable row level security;
alter table public.coaches enable row level security;
alter table public.coach_team_assignments enable row level security;

revoke all on table public.teams from public, anon;
revoke all on table public.players from public, anon;
revoke all on table public.team_memberships from public, anon;
revoke all on table public.coaches from public, anon;
revoke all on table public.coach_team_assignments from public, anon;

grant select, insert, update, delete on table public.teams to authenticated;
grant select, insert, update, delete on table public.players to authenticated;
grant select, insert, update, delete on table public.team_memberships to authenticated;
grant select, insert, update, delete on table public.coaches to authenticated;
grant select, insert, update, delete on table public.coach_team_assignments to authenticated;

-- profiles: admins need to identify users when linking coaches (phone is PII).
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin
  on public.profiles
  for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists user_roles_select_admin on public.user_roles;
create policy user_roles_select_admin
  on public.user_roles
  for select
  to authenticated
  using (public.has_role('admin'));

-- teams
drop policy if exists teams_select_admin on public.teams;
create policy teams_select_admin
  on public.teams
  for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists teams_select_assigned_coach on public.teams;
create policy teams_select_assigned_coach
  on public.teams
  for select
  to authenticated
  using (public.is_assigned_coach_for_team(id));

drop policy if exists teams_insert_admin on public.teams;
create policy teams_insert_admin
  on public.teams
  for insert
  to authenticated
  with check (public.has_role('admin'));

drop policy if exists teams_update_admin on public.teams;
create policy teams_update_admin
  on public.teams
  for update
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists teams_delete_admin on public.teams;
create policy teams_delete_admin
  on public.teams
  for delete
  to authenticated
  using (public.has_role('admin'));

-- players (birth_date is on the row; parents and anon get no rows)
drop policy if exists players_select_admin on public.players;
create policy players_select_admin
  on public.players
  for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists players_select_assigned_coach on public.players;
create policy players_select_assigned_coach
  on public.players
  for select
  to authenticated
  using (public.coach_can_read_player(id));

drop policy if exists players_insert_admin on public.players;
create policy players_insert_admin
  on public.players
  for insert
  to authenticated
  with check (public.has_role('admin'));

drop policy if exists players_update_admin on public.players;
create policy players_update_admin
  on public.players
  for update
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists players_delete_admin on public.players;
create policy players_delete_admin
  on public.players
  for delete
  to authenticated
  using (public.has_role('admin'));

-- team_memberships
drop policy if exists team_memberships_select_admin on public.team_memberships;
create policy team_memberships_select_admin
  on public.team_memberships
  for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists team_memberships_select_assigned_coach on public.team_memberships;
create policy team_memberships_select_assigned_coach
  on public.team_memberships
  for select
  to authenticated
  using (public.is_assigned_coach_for_team(team_id));

drop policy if exists team_memberships_insert_admin on public.team_memberships;
create policy team_memberships_insert_admin
  on public.team_memberships
  for insert
  to authenticated
  with check (public.has_role('admin'));

drop policy if exists team_memberships_update_admin on public.team_memberships;
create policy team_memberships_update_admin
  on public.team_memberships
  for update
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists team_memberships_delete_admin on public.team_memberships;
create policy team_memberships_delete_admin
  on public.team_memberships
  for delete
  to authenticated
  using (public.has_role('admin'));

-- coaches
drop policy if exists coaches_select_admin on public.coaches;
create policy coaches_select_admin
  on public.coaches
  for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists coaches_select_own on public.coaches;
create policy coaches_select_own
  on public.coaches
  for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists coaches_insert_admin on public.coaches;
create policy coaches_insert_admin
  on public.coaches
  for insert
  to authenticated
  with check (public.has_role('admin'));

drop policy if exists coaches_update_admin on public.coaches;
create policy coaches_update_admin
  on public.coaches
  for update
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists coaches_delete_admin on public.coaches;
create policy coaches_delete_admin
  on public.coaches
  for delete
  to authenticated
  using (public.has_role('admin'));

-- coach_team_assignments
drop policy if exists coach_team_assignments_select_admin on public.coach_team_assignments;
create policy coach_team_assignments_select_admin
  on public.coach_team_assignments
  for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists coach_team_assignments_select_own on public.coach_team_assignments;
create policy coach_team_assignments_select_own
  on public.coach_team_assignments
  for select
  to authenticated
  using (coach_id = public.current_coach_id());

drop policy if exists coach_team_assignments_insert_admin on public.coach_team_assignments;
create policy coach_team_assignments_insert_admin
  on public.coach_team_assignments
  for insert
  to authenticated
  with check (public.has_role('admin'));

drop policy if exists coach_team_assignments_update_admin on public.coach_team_assignments;
create policy coach_team_assignments_update_admin
  on public.coach_team_assignments
  for update
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists coach_team_assignments_delete_admin on public.coach_team_assignments;
create policy coach_team_assignments_delete_admin
  on public.coach_team_assignments
  for delete
  to authenticated
  using (public.has_role('admin'));
