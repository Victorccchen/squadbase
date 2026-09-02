-- Stage 1: profiles, multi-role model, first-login bootstrap, basic RLS.
-- Apply to the staging project only. Do not run against production.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'app_role'
      and n.nspname = 'public'
  ) then
    create type public.app_role as enum ('parent', 'coach', 'admin', 'player');
  end if;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint user_roles_user_id_role_key unique (user_id, role)
);

create index if not exists user_roles_user_id_idx on public.user_roles (user_id);

comment on type public.app_role is
  'Application roles. player is reserved for later stages; there is no player login UX in Stage 1.';
comment on table public.profiles is
  'One profile row per auth user. Phone is copied from auth.users for display; auth.users remains the source of truth.';
comment on table public.user_roles is
  'Multiple roles per user. Privilege changes are done in the Supabase Dashboard, not by end users.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

drop trigger if exists user_roles_set_updated_at on public.user_roles;
create trigger user_roles_set_updated_at
  before update on public.user_roles
  for each row
  execute function public.set_updated_at();

-- Create profile + default parent role when a new auth user is inserted.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, phone, created_by, updated_by)
  values (new.id, new.phone, new.id, new.id)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role, created_by, updated_by)
  values (new.id, 'parent'::public.app_role, new.id, new.id)
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Idempotent fallback for first successful login (covers users created before this migration).
create or replace function public.ensure_own_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  auth_phone text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select phone into auth_phone from auth.users where id = uid;

  insert into public.profiles (id, phone, created_by, updated_by)
  values (uid, auth_phone, uid, uid)
  on conflict (id) do update
    set phone = excluded.phone,
        updated_by = uid
    where public.profiles.phone is distinct from excluded.phone;

  insert into public.user_roles (user_id, role, created_by, updated_by)
  values (uid, 'parent'::public.app_role, uid, uid)
  on conflict (user_id, role) do nothing;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.ensure_own_profile() from public, anon;
grant execute on function public.ensure_own_profile() to authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

revoke all on table public.profiles from public, anon;
revoke all on table public.user_roles from public, anon;

grant select on table public.profiles to authenticated;
grant update (display_name, updated_at, updated_by) on table public.profiles to authenticated;
grant select on table public.user_roles to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own
  on public.user_roles
  for select
  to authenticated
  using (user_id = auth.uid());
