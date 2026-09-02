-- Stage 3: guardian–player binding with admin approval.
-- Apply to the staging project only. Do not run against production.
--
-- Schema choice: one row per request (rejected rows are kept as history).
-- Partial unique index: at most one pending or approved pair per
-- (guardian_user_id, player_id). After reject, the parent may insert a new
-- pending row. Approved links are the future parent-proxy gate (courses,
-- attendance, notes) — those features are not implemented here.
--
-- Player discovery is NOT a SELECT on public.players. Parents call
-- search_player_for_guardian_link (security definer) with either
-- exact team + jersey, or birth date + name fragment (min 2 chars).
-- Teams for the search dropdown come from list_active_teams_for_link.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'guardian_relation'
      and n.nspname = 'public'
  ) then
    create type public.guardian_relation as enum ('parent', 'guardian', 'other');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'link_status'
      and n.nspname = 'public'
  ) then
    create type public.link_status as enum ('pending', 'approved', 'rejected');
  end if;
end
$$;

create table if not exists public.guardian_player_links (
  id uuid primary key default gen_random_uuid(),
  guardian_user_id uuid not null,
  player_id uuid not null,
  relation public.guardian_relation not null default 'parent',
  status public.link_status not null default 'pending',
  parent_note text,
  admin_note text,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint guardian_player_links_guardian_user_id_fkey
    foreign key (guardian_user_id) references public.profiles (id) on delete cascade,
  constraint guardian_player_links_player_id_fkey
    foreign key (player_id) references public.players (id) on delete restrict,
  constraint guardian_player_links_parent_note_length
    check (parent_note is null or char_length(parent_note) <= 1000),
  constraint guardian_player_links_admin_note_length
    check (admin_note is null or char_length(admin_note) <= 1000),
  constraint guardian_player_links_review_fields_match_status check (
    (
      status = 'pending'
      and reviewed_by is null
      and reviewed_at is null
    )
    or (
      status in ('approved', 'rejected')
      and reviewed_by is not null
      and reviewed_at is not null
    )
  )
);

create unique index if not exists guardian_player_links_open_pair_idx
  on public.guardian_player_links (guardian_user_id, player_id)
  where status in ('pending', 'approved');

create index if not exists guardian_player_links_guardian_user_id_idx
  on public.guardian_player_links (guardian_user_id);

create index if not exists guardian_player_links_player_id_idx
  on public.guardian_player_links (player_id);

create index if not exists guardian_player_links_status_idx
  on public.guardian_player_links (status);

comment on type public.guardian_relation is
  'How the signed-in user relates to the player. parent/guardian/other; later stages may proxy as this adult.';
comment on type public.link_status is
  'Admin approval state. Only approved guardians may read linked player rows.';
comment on table public.guardian_player_links is
  'Parent requests to link to an existing player. Admins approve or reject. Pending/rejected must not read player PII via table SELECT. Designed so later parent-proxy (courses, attendance) can key off status = approved.';

grant usage on type public.guardian_relation to authenticated;
grant usage on type public.link_status to authenticated;

drop trigger if exists guardian_player_links_set_updated_at on public.guardian_player_links;
create trigger guardian_player_links_set_updated_at
  before update on public.guardian_player_links
  for each row
  execute function public.set_updated_at();

drop trigger if exists guardian_player_links_set_actor_columns on public.guardian_player_links;
create trigger guardian_player_links_set_actor_columns
  before insert or update on public.guardian_player_links
  for each row
  execute function public.set_actor_columns();

create or replace function public.is_approved_guardian_for_player(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.guardian_player_links
    where player_id = p_player_id
      and guardian_user_id = auth.uid()
      and status = 'approved'
  );
$$;

create or replace function public.guardian_can_read_team(p_team_id uuid)
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
      and public.is_approved_guardian_for_player(m.player_id)
  );
$$;

create or replace function public.list_active_teams_for_link()
returns table (
  id uuid,
  name text,
  age_band public.age_band
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select t.id, t.name, t.age_band
  from public.teams t
  where t.status = 'active'
  order by t.name;
end;
$$;

create or replace function public.search_player_for_guardian_link(
  p_team_id uuid default null,
  p_jersey integer default null,
  p_birth_date date default null,
  p_name_fragment text default null
)
returns table (
  id uuid,
  name_zh text,
  name_en_given text,
  name_en_family text,
  name_ja text,
  birth_date date,
  team_id uuid,
  team_name text,
  jersey_number integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  has_jersey_mode boolean;
  has_identity_mode boolean;
  fragment text;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  has_jersey_mode := p_team_id is not null and p_jersey is not null;
  has_identity_mode :=
    p_birth_date is not null
    and p_name_fragment is not null
    and char_length(btrim(p_name_fragment)) >= 2;

  if not has_jersey_mode and not has_identity_mode then
    return;
  end if;

  if p_jersey is not null and (p_jersey < 1 or p_jersey > 99) then
    return;
  end if;

  fragment := replace(
    replace(
      replace(btrim(coalesce(p_name_fragment, '')), '\', '\\'),
      '%',
      '\%'
    ),
    '_',
    '\_'
  );

  return query
  select
    p.id,
    p.name_zh,
    p.name_en_given,
    p.name_en_family,
    p.name_ja,
    p.birth_date,
    m.team_id,
    m.team_name,
    m.jersey_number
  from public.players p
  left join lateral (
    select
      tm.team_id,
      t.name as team_name,
      tm.jersey_number
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id
    where tm.player_id = p.id
      and tm.status = 'active'
      and t.status = 'active'
      and (
        not has_jersey_mode
        or (tm.team_id = p_team_id and tm.jersey_number = p_jersey)
      )
    order by tm.updated_at desc
    limit 1
  ) m on true
  where p.status = 'active'
    and (
      not has_jersey_mode
      or (
        m.team_id = p_team_id
        and m.jersey_number = p_jersey
      )
    )
    and (
      not has_identity_mode
      or (
        p.birth_date = p_birth_date
        and (
          coalesce(p.name_zh, '') ilike '%' || fragment || '%' escape '\'
          or p.name_en_given ilike '%' || fragment || '%' escape '\'
          or p.name_en_family ilike '%' || fragment || '%' escape '\'
          or coalesce(p.name_ja, '') ilike '%' || fragment || '%' escape '\'
          or (p.name_en_given || ' ' || p.name_en_family) ilike '%' || fragment || '%' escape '\'
        )
      )
    )
  order by p.name_en_family, p.name_en_given
  limit 5;
end;
$$;

create or replace function public.admin_review_guardian_link(
  p_link_id uuid,
  p_status public.link_status,
  p_admin_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'invalid link status' using errcode = '22023';
  end if;

  update public.guardian_player_links
  set
    status = p_status,
    admin_note = nullif(btrim(coalesce(p_admin_note, '')), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_by = auth.uid()
  where id = p_link_id
    and status = 'pending';

  if not found then
    raise exception 'link not found or not pending' using errcode = 'P0002';
  end if;

  return p_link_id;
end;
$$;

revoke all on function public.is_approved_guardian_for_player(uuid) from public, anon;
revoke all on function public.guardian_can_read_team(uuid) from public, anon;
revoke all on function public.list_active_teams_for_link() from public, anon;
revoke all on function public.search_player_for_guardian_link(uuid, integer, date, text) from public, anon;
revoke all on function public.admin_review_guardian_link(uuid, public.link_status, text) from public, anon;

grant execute on function public.is_approved_guardian_for_player(uuid) to authenticated;
grant execute on function public.guardian_can_read_team(uuid) to authenticated;
grant execute on function public.list_active_teams_for_link() to authenticated;
grant execute on function public.search_player_for_guardian_link(uuid, integer, date, text) to authenticated;
grant execute on function public.admin_review_guardian_link(uuid, public.link_status, text) to authenticated;

alter table public.guardian_player_links enable row level security;

revoke all on table public.guardian_player_links from public, anon;
grant select, insert, update, delete on table public.guardian_player_links to authenticated;

drop policy if exists guardian_player_links_select_own on public.guardian_player_links;
create policy guardian_player_links_select_own
  on public.guardian_player_links
  for select
  to authenticated
  using (guardian_user_id = auth.uid());

drop policy if exists guardian_player_links_select_admin on public.guardian_player_links;
create policy guardian_player_links_select_admin
  on public.guardian_player_links
  for select
  to authenticated
  using (public.has_role('admin'));

-- Parents insert their own pending requests. They cannot self-approve:
-- status must be pending and review columns must stay empty.
drop policy if exists guardian_player_links_insert_own_pending on public.guardian_player_links;
create policy guardian_player_links_insert_own_pending
  on public.guardian_player_links
  for insert
  to authenticated
  with check (
    guardian_user_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and admin_note is null
  );

drop policy if exists guardian_player_links_update_admin on public.guardian_player_links;
create policy guardian_player_links_update_admin
  on public.guardian_player_links
  for update
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists guardian_player_links_delete_admin on public.guardian_player_links;
create policy guardian_player_links_delete_admin
  on public.guardian_player_links
  for delete
  to authenticated
  using (public.has_role('admin'));

-- Approved guardians may read linked players' basic row (names, birth_date, status).
-- Pending/rejected links do not satisfy is_approved_guardian_for_player.
drop policy if exists players_select_approved_guardian on public.players;
create policy players_select_approved_guardian
  on public.players
  for select
  to authenticated
  using (public.is_approved_guardian_for_player(id));

drop policy if exists team_memberships_select_approved_guardian on public.team_memberships;
create policy team_memberships_select_approved_guardian
  on public.team_memberships
  for select
  to authenticated
  using (public.is_approved_guardian_for_player(player_id));

drop policy if exists teams_select_approved_guardian on public.teams;
create policy teams_select_approved_guardian
  on public.teams
  for select
  to authenticated
  using (public.guardian_can_read_team(id));
