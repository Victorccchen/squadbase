-- Stage 4: training sessions, parent registration, and registration Q&A.
-- Apply to the staging project only. Do not run against production.
--
-- Schema:
--   * training_sessions hang under an existing team (梯隊). status is
--     org_status active/inactive (same pattern as teams). Inactive sessions
--     are not offered for new parent signup.
--   * session_registrations: auto-approved (status registered). No capacity
--     limit. Optional parent_note is one-way to the club.
--   * Unique open registration per (session_id, player_id) where status =
--     registered. Cancelled rows are history; the same pair may re-register
--     while the session is still active.
--   * session_registration_messages: simple Q&A thread. author_role is
--     parent|admin. Any approved guardian of that player may read and post;
--     admins reply; coaches may SELECT roster/messages on assigned teams.
--
-- Parents never receive a full session or roster dump: SELECT is limited to
-- sessions on teams of their approved children (or sessions they already
-- registered for). Writes go through security-definer RPCs.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'session_registration_status'
      and n.nspname = 'public'
  ) then
    create type public.session_registration_status as enum ('registered', 'cancelled');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'session_message_author_role'
      and n.nspname = 'public'
  ) then
    create type public.session_message_author_role as enum ('parent', 'admin');
  end if;
end
$$;

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  status public.org_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint training_sessions_ends_after_starts check (ends_at > starts_at),
  constraint training_sessions_location_length
    check (location is null or char_length(location) <= 200),
  constraint training_sessions_notes_length
    check (notes is null or char_length(notes) <= 1000)
);

create table if not exists public.session_registrations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  guardian_user_id uuid not null references public.profiles (id) on delete cascade,
  status public.session_registration_status not null default 'registered',
  parent_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint session_registrations_parent_note_length
    check (parent_note is null or char_length(parent_note) <= 1000)
);

create table if not exists public.session_registration_messages (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.session_registrations (id) on delete cascade,
  author_user_id uuid not null references public.profiles (id) on delete restrict,
  author_role public.session_message_author_role not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint session_registration_messages_body_length
    check (char_length(btrim(body)) >= 1 and char_length(body) <= 2000)
);

create unique index if not exists session_registrations_open_pair_idx
  on public.session_registrations (session_id, player_id)
  where status = 'registered';

create index if not exists training_sessions_team_id_idx
  on public.training_sessions (team_id);

create index if not exists training_sessions_starts_at_idx
  on public.training_sessions (starts_at);

create index if not exists training_sessions_status_idx
  on public.training_sessions (status);

create index if not exists session_registrations_session_id_idx
  on public.session_registrations (session_id);

create index if not exists session_registrations_player_id_idx
  on public.session_registrations (player_id);

create index if not exists session_registrations_guardian_user_id_idx
  on public.session_registrations (guardian_user_id);

create index if not exists session_registration_messages_registration_id_idx
  on public.session_registration_messages (registration_id);

comment on type public.session_registration_status is
  'Open signup is registered (auto-approved). cancelled is history; the same player may re-register on an active session.';
comment on type public.session_message_author_role is
  'Q&A author. parent = approved guardian; admin = club admin reply. Coaches do not post in Stage 4.';
comment on table public.training_sessions is
  'Independent training sessions under a team. Inactive sessions are hidden from new parent signup. No capacity limit in Stage 4.';
comment on table public.session_registrations is
  'Parent signup of an approved linked child. Auto-registered. Unique open row per (session, player).';
comment on table public.session_registration_messages is
  'Simple Q&A thread on a registration. Parents post questions; admins reply.';

grant usage on type public.session_registration_status to authenticated;
grant usage on type public.session_message_author_role to authenticated;

drop trigger if exists training_sessions_set_updated_at on public.training_sessions;
create trigger training_sessions_set_updated_at
  before update on public.training_sessions
  for each row
  execute function public.set_updated_at();

drop trigger if exists training_sessions_set_actor_columns on public.training_sessions;
create trigger training_sessions_set_actor_columns
  before insert or update on public.training_sessions
  for each row
  execute function public.set_actor_columns();

drop trigger if exists session_registrations_set_updated_at on public.session_registrations;
create trigger session_registrations_set_updated_at
  before update on public.session_registrations
  for each row
  execute function public.set_updated_at();

drop trigger if exists session_registrations_set_actor_columns on public.session_registrations;
create trigger session_registrations_set_actor_columns
  before insert or update on public.session_registrations
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

create or replace function public.coach_can_read_session(p_session_id uuid)
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
      and public.is_assigned_coach_for_team(s.team_id)
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
  note text;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not public.is_approved_guardian_for_player(p_player_id) then
    raise exception 'not an approved guardian for this player' using errcode = '42501';
  end if;

  select s.team_id, s.status
    into session_team, session_status
  from public.training_sessions s
  where s.id = p_session_id;

  if session_team is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  if session_status is distinct from 'active' then
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

create or replace function public.cancel_session_registration(p_registration_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_player uuid;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select player_id into target_player
  from public.session_registrations
  where id = p_registration_id
    and status = 'registered';

  if target_player is null then
    raise exception 'registration not found' using errcode = 'P0002';
  end if;

  if not public.is_approved_guardian_for_player(target_player)
     and not public.has_role('admin') then
    raise exception 'cannot cancel registration' using errcode = '42501';
  end if;

  update public.session_registrations
  set
    status = 'cancelled',
    updated_by = auth.uid()
  where id = p_registration_id
    and status = 'registered';

  if not found then
    raise exception 'cannot cancel registration' using errcode = 'P0001';
  end if;

  return p_registration_id;
end;
$$;

create or replace function public.switch_session_registration(
  p_registration_id uuid,
  p_new_session_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  old_session uuid;
  old_player uuid;
  old_note text;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select session_id, player_id, parent_note
    into old_session, old_player, old_note
  from public.session_registrations
  where id = p_registration_id
    and status = 'registered';

  if old_player is null then
    raise exception 'registration not found' using errcode = 'P0002';
  end if;

  if not public.is_approved_guardian_for_player(old_player) then
    raise exception 'cannot switch session' using errcode = '42501';
  end if;

  if old_session = p_new_session_id then
    raise exception 'cannot switch to the same session' using errcode = 'P0001';
  end if;

  perform public.cancel_session_registration(p_registration_id);
  new_id := public.register_player_for_session(p_new_session_id, old_player, old_note);
  return new_id;
end;
$$;

create or replace function public.post_session_registration_message(
  p_registration_id uuid,
  p_body text,
  p_author_role public.session_message_author_role
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_player uuid;
  new_id uuid;
  trimmed text;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  trimmed := btrim(coalesce(p_body, ''));
  if char_length(trimmed) < 1 then
    raise exception 'message body required' using errcode = '22023';
  end if;
  trimmed := left(trimmed, 2000);

  select player_id into target_player
  from public.session_registrations
  where id = p_registration_id;

  if target_player is null then
    raise exception 'registration not found' using errcode = 'P0002';
  end if;

  if p_author_role = 'admin' then
    if not public.has_role('admin') then
      raise exception 'not authorized' using errcode = '42501';
    end if;
  elsif p_author_role = 'parent' then
    if not public.is_approved_guardian_for_player(target_player) then
      raise exception 'not an approved guardian for this player' using errcode = '42501';
    end if;
  else
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.session_registration_messages (
    registration_id,
    author_user_id,
    author_role,
    body
  )
  values (
    p_registration_id,
    auth.uid(),
    p_author_role,
    trimmed
  )
  returning id into new_id;

  return new_id;
end;
$$;

-- Team hard-delete must also remove sessions (registrations/messages cascade).
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

  delete from public.teams
  where id = p_team_id;

  if not found then
    raise exception 'team not found' using errcode = 'P0002';
  end if;

  return p_team_id;
end;
$$;

comment on function public.admin_delete_team(uuid) is
  'Admin-only hard delete. Blocks only while active team_memberships exist. Removes inactive memberships, coach assignments, and training sessions (registrations cascade) in the same transaction. Does not delete players.';

comment on function public.register_player_for_session(uuid, uuid, text) is
  'Approved guardian registers a linked child on an active session. Auto-registered. Re-register after cancel is allowed while the session stays active.';
comment on function public.cancel_session_registration(uuid) is
  'Approved guardian (or admin) cancels an open registration. History row stays; the pair may re-register.';
comment on function public.switch_session_registration(uuid, uuid) is
  'Cancels the current open registration and registers the same player on another active session of their team.';
comment on function public.post_session_registration_message(uuid, text, public.session_message_author_role) is
  'Parent question or admin reply on a registration. Coaches cannot post.';

revoke all on function public.guardian_can_read_session(uuid) from public, anon;
revoke all on function public.coach_can_read_session(uuid) from public, anon;
revoke all on function public.register_player_for_session(uuid, uuid, text) from public, anon;
revoke all on function public.cancel_session_registration(uuid) from public, anon;
revoke all on function public.switch_session_registration(uuid, uuid) from public, anon;
revoke all on function public.post_session_registration_message(uuid, text, public.session_message_author_role) from public, anon;
revoke all on function public.admin_delete_team(uuid) from public, anon;

grant execute on function public.guardian_can_read_session(uuid) to authenticated;
grant execute on function public.coach_can_read_session(uuid) to authenticated;
grant execute on function public.register_player_for_session(uuid, uuid, text) to authenticated;
grant execute on function public.cancel_session_registration(uuid) to authenticated;
grant execute on function public.switch_session_registration(uuid, uuid) to authenticated;
grant execute on function public.post_session_registration_message(uuid, text, public.session_message_author_role) to authenticated;
grant execute on function public.admin_delete_team(uuid) to authenticated;

alter table public.training_sessions enable row level security;
alter table public.session_registrations enable row level security;
alter table public.session_registration_messages enable row level security;

revoke all on table public.training_sessions from public, anon;
revoke all on table public.session_registrations from public, anon;
revoke all on table public.session_registration_messages from public, anon;

grant select, insert, update, delete on table public.training_sessions to authenticated;
grant select, insert, update, delete on table public.session_registrations to authenticated;
grant select, insert, update, delete on table public.session_registration_messages to authenticated;

-- training_sessions
drop policy if exists training_sessions_select_admin on public.training_sessions;
create policy training_sessions_select_admin
  on public.training_sessions
  for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists training_sessions_select_assigned_coach on public.training_sessions;
create policy training_sessions_select_assigned_coach
  on public.training_sessions
  for select
  to authenticated
  using (public.is_assigned_coach_for_team(team_id));

drop policy if exists training_sessions_select_approved_guardian on public.training_sessions;
create policy training_sessions_select_approved_guardian
  on public.training_sessions
  for select
  to authenticated
  using (public.guardian_can_read_session(id));

drop policy if exists training_sessions_insert_admin on public.training_sessions;
create policy training_sessions_insert_admin
  on public.training_sessions
  for insert
  to authenticated
  with check (public.has_role('admin'));

drop policy if exists training_sessions_update_admin on public.training_sessions;
create policy training_sessions_update_admin
  on public.training_sessions
  for update
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists training_sessions_delete_admin on public.training_sessions;
create policy training_sessions_delete_admin
  on public.training_sessions
  for delete
  to authenticated
  using (public.has_role('admin'));

-- session_registrations
drop policy if exists session_registrations_select_admin on public.session_registrations;
create policy session_registrations_select_admin
  on public.session_registrations
  for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists session_registrations_select_assigned_coach on public.session_registrations;
create policy session_registrations_select_assigned_coach
  on public.session_registrations
  for select
  to authenticated
  using (public.coach_can_read_session(session_id));

drop policy if exists session_registrations_select_approved_guardian on public.session_registrations;
create policy session_registrations_select_approved_guardian
  on public.session_registrations
  for select
  to authenticated
  using (public.is_approved_guardian_for_player(player_id));

drop policy if exists session_registrations_insert_approved_guardian on public.session_registrations;
create policy session_registrations_insert_approved_guardian
  on public.session_registrations
  for insert
  to authenticated
  with check (
    guardian_user_id = auth.uid()
    and status = 'registered'
    and public.is_approved_guardian_for_player(player_id)
  );

drop policy if exists session_registrations_update_approved_guardian_cancel on public.session_registrations;
create policy session_registrations_update_approved_guardian_cancel
  on public.session_registrations
  for update
  to authenticated
  using (
    public.is_approved_guardian_for_player(player_id)
    and status = 'registered'
  )
  with check (
    public.is_approved_guardian_for_player(player_id)
    and status = 'cancelled'
  );

drop policy if exists session_registrations_update_admin on public.session_registrations;
create policy session_registrations_update_admin
  on public.session_registrations
  for update
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists session_registrations_delete_admin on public.session_registrations;
create policy session_registrations_delete_admin
  on public.session_registrations
  for delete
  to authenticated
  using (public.has_role('admin'));

-- session_registration_messages
drop policy if exists session_registration_messages_select_admin on public.session_registration_messages;
create policy session_registration_messages_select_admin
  on public.session_registration_messages
  for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists session_registration_messages_select_assigned_coach on public.session_registration_messages;
create policy session_registration_messages_select_assigned_coach
  on public.session_registration_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.session_registrations r
      where r.id = registration_id
        and public.coach_can_read_session(r.session_id)
    )
  );

drop policy if exists session_registration_messages_select_approved_guardian on public.session_registration_messages;
create policy session_registration_messages_select_approved_guardian
  on public.session_registration_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.session_registrations r
      where r.id = registration_id
        and public.is_approved_guardian_for_player(r.player_id)
    )
  );

drop policy if exists session_registration_messages_insert_parent on public.session_registration_messages;
create policy session_registration_messages_insert_parent
  on public.session_registration_messages
  for insert
  to authenticated
  with check (
    author_user_id = auth.uid()
    and author_role = 'parent'
    and exists (
      select 1
      from public.session_registrations r
      where r.id = registration_id
        and public.is_approved_guardian_for_player(r.player_id)
    )
  );

drop policy if exists session_registration_messages_insert_admin on public.session_registration_messages;
create policy session_registration_messages_insert_admin
  on public.session_registration_messages
  for insert
  to authenticated
  with check (
    author_user_id = auth.uid()
    and author_role = 'admin'
    and public.has_role('admin')
  );
