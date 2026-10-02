-- Phase 1 PR-03: audit log and task inbox.
--
-- audit_log: who changed what, before and after. Written by triggers on the
-- tables that matter for money and access, so RPCs and direct table writes
-- (parents create and withdraw binding requests through the table) are both
-- covered. Rows cannot be edited or deleted; only processed_at may be set,
-- for the notification outbox in phase 2. Admins read it; nobody writes it
-- directly.
--
-- tasks: things a person has to handle, shown on the admin home page. Opened
-- and closed by triggers (payment claim pending, binding request pending) and
-- by later PRs through open_task / close_task_by_key. One open task per
-- dedupe_key.
--
-- Credit adjustments are already recorded with their actor in the immutable
-- session_credit_ledger, so the ledger is not audited twice.
--
-- Apply on staging only (Database (staging) workflow).

-- 1. Tables ------------------------------------------------------------------

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  processed_at timestamptz,
  constraint audit_log_action_not_blank check (char_length(btrim(action)) > 0)
);

create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id, at desc);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_unprocessed_idx on public.audit_log (at) where processed_at is null;

comment on table public.audit_log is
  'Append-only change log for money and access tables. Only processed_at may change (notification outbox).';

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  entity_type text,
  entity_id uuid,
  params jsonb not null default '{}'::jsonb,
  assignee_role text not null default 'admin',
  assignee_id uuid references auth.users (id) on delete set null,
  status text not null default 'open',
  due_at timestamptz,
  snoozed_until timestamptz,
  dedupe_key text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,
  constraint tasks_status_valid check (status in ('open', 'snoozed', 'done', 'dismissed')),
  constraint tasks_assignee_role_valid check (assignee_role in ('admin', 'staff', 'director')),
  constraint tasks_snooze_has_time check (status <> 'snoozed' or snoozed_until is not null),
  constraint tasks_closed_has_time check (status not in ('done', 'dismissed') or done_at is not null)
);

-- One open (or snoozed) task per subject; a closed one may be reopened later.
create unique index if not exists tasks_open_dedupe_idx
  on public.tasks (dedupe_key)
  where status in ('open', 'snoozed');
create index if not exists tasks_inbox_idx on public.tasks (status, due_at, created_at);
create index if not exists tasks_entity_idx on public.tasks (entity_type, entity_id);

comment on table public.tasks is
  'Work items for staff. Opened and closed by triggers and RPCs; admins change status via admin_set_task_status.';

-- 2. Access ------------------------------------------------------------------

alter table public.audit_log enable row level security;
alter table public.tasks enable row level security;

drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin
  on public.audit_log
  for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists tasks_select_admin on public.tasks;
create policy tasks_select_admin
  on public.tasks
  for select
  to authenticated
  using (public.has_role('admin'));

revoke all on table public.audit_log from public, anon, authenticated;
revoke all on table public.tasks from public, anon, authenticated;
grant select on table public.audit_log to authenticated;
grant select on table public.tasks to authenticated;

-- 3. audit_log is append-only -----------------------------------------------

create or replace function public.audit_log_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'audit_log is append-only' using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - 'processed_at') is distinct from (to_jsonb(old) - 'processed_at') then
    raise exception 'audit_log is append-only' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.audit_log_append_only() from public, anon, authenticated;

drop trigger if exists audit_log_append_only on public.audit_log;
create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row
  execute function public.audit_log_append_only();

-- 4. Helpers (internal: called from triggers and other security definer RPCs)

create or replace function public.write_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.open_task(
  p_kind text,
  p_entity_type text,
  p_entity_id uuid,
  p_dedupe_key text,
  p_assignee_role text default 'admin',
  p_due_at timestamptz default null,
  p_params jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.tasks (kind, entity_type, entity_id, dedupe_key, assignee_role, due_at, params)
  values (p_kind, p_entity_type, p_entity_id, p_dedupe_key, coalesce(p_assignee_role, 'admin'), p_due_at, coalesce(p_params, '{}'::jsonb))
  on conflict (dedupe_key) where status in ('open', 'snoozed') do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.tasks
    where dedupe_key = p_dedupe_key and status in ('open', 'snoozed');
  end if;
  return v_id;
end;
$$;

create or replace function public.close_task_by_key(
  p_dedupe_key text,
  p_status text default 'done'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_status not in ('done', 'dismissed') then
    raise exception 'invalid task status' using errcode = 'P0001';
  end if;
  update public.tasks
  set status = p_status, done_at = now(), done_by = auth.uid(), snoozed_until = null
  where dedupe_key = p_dedupe_key
    and status in ('open', 'snoozed');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.write_audit(text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.open_task(text, text, uuid, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.close_task_by_key(text, text) from public, anon, authenticated;

-- 5. Admin RPCs --------------------------------------------------------------

-- Change a task's status from the inbox: done, dismissed, snoozed (with time) or reopen.
create or replace function public.admin_set_task_status(
  p_task_id uuid,
  p_status text,
  p_snoozed_until timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks%rowtype;
  v_after public.tasks%rowtype;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_status not in ('open', 'snoozed', 'done', 'dismissed') then
    raise exception 'invalid task status' using errcode = 'P0001';
  end if;
  if p_status = 'snoozed' and (p_snoozed_until is null or p_snoozed_until <= now()) then
    raise exception 'snooze needs a future time' using errcode = 'P0001';
  end if;

  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;

  begin
    update public.tasks
    set
      status = p_status,
      snoozed_until = case when p_status = 'snoozed' then p_snoozed_until else null end,
      done_at = case when p_status in ('done', 'dismissed') then now() else null end,
      done_by = case when p_status in ('done', 'dismissed') then auth.uid() else null end
    where id = p_task_id
    returning * into v_after;
  exception
    when unique_violation then
      raise exception 'another open task already covers this' using errcode = 'P0001';
  end;

  perform public.write_audit('task.' || p_status, 'task', p_task_id, to_jsonb(v_task), to_jsonb(v_after));
  return p_task_id;
end;
$$;

-- Record an app-side admin event that has no table row of its own
-- (for example a photo ZIP download). Admin only.
create or replace function public.admin_log_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_action is null or p_action !~ '^[a-z_]+\.[a-z_]+$' then
    raise exception 'invalid audit action' using errcode = 'P0001';
  end if;
  return public.write_audit(p_action, coalesce(p_entity_type, 'app'), p_entity_id, null, coalesce(p_details, '{}'::jsonb));
end;
$$;

revoke all on function public.admin_set_task_status(uuid, text, timestamptz) from public, anon;
grant execute on function public.admin_set_task_status(uuid, text, timestamptz) to authenticated;
revoke all on function public.admin_log_event(text, text, uuid, jsonb) from public, anon;
grant execute on function public.admin_log_event(text, text, uuid, jsonb) to authenticated;

-- 6. Audit triggers ----------------------------------------------------------

-- TG_ARGV[0] = entity type. Skips updates that only touch bookkeeping columns.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_after jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_id uuid;
begin
  if tg_op = 'UPDATE'
     and (v_before - 'updated_at' - 'updated_by') = (v_after - 'updated_at' - 'updated_by') then
    return null;
  end if;

  v_id := nullif(coalesce(v_after, v_before) ->> 'id', '')::uuid;
  perform public.write_audit(
    tg_argv[0] || '.' || lower(tg_op),
    tg_argv[0],
    v_id,
    v_before,
    v_after
  );
  return null;
end;
$$;

revoke all on function public.audit_row_change() from public, anon, authenticated;

drop trigger if exists audit_payment_claims on public.payment_claims;
create trigger audit_payment_claims
  after insert or update or delete on public.payment_claims
  for each row execute function public.audit_row_change('payment_claim');

drop trigger if exists audit_session_packages on public.session_packages;
create trigger audit_session_packages
  after insert or update or delete on public.session_packages
  for each row execute function public.audit_row_change('session_package');

drop trigger if exists audit_guardian_player_links on public.guardian_player_links;
create trigger audit_guardian_player_links
  after insert or update or delete on public.guardian_player_links
  for each row execute function public.audit_row_change('guardian_link');

drop trigger if exists audit_session_attendance on public.session_attendance;
create trigger audit_session_attendance
  after insert or update or delete on public.session_attendance
  for each row execute function public.audit_row_change('attendance');

drop trigger if exists audit_user_roles on public.user_roles;
create trigger audit_user_roles
  after insert or update or delete on public.user_roles
  for each row execute function public.audit_row_change('user_role');

drop trigger if exists audit_club_runtime_settings on public.club_runtime_settings;
create trigger audit_club_runtime_settings
  after insert or update or delete on public.club_runtime_settings
  for each row execute function public.audit_row_change('club_setting');

-- 7. Task triggers -----------------------------------------------------------

create or replace function public.tasks_from_payment_claims()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.open_task('payment_claim.pending', 'payment_claim', new.id, 'payment_claim:' || new.id::text);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status <> 'pending' then
    perform public.close_task_by_key('payment_claim:' || new.id::text, 'done');
  end if;
  return null;
end;
$$;

create or replace function public.tasks_from_guardian_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.open_task('guardian_link.pending', 'guardian_link', new.id, 'guardian_link:' || new.id::text);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status <> 'pending' then
    -- Parent withdrew (revoked) → dismissed; admin approved or rejected → done.
    perform public.close_task_by_key(
      'guardian_link:' || new.id::text,
      case when new.status = 'revoked' and new.reviewed_by is null then 'dismissed' else 'done' end
    );
  end if;
  return null;
end;
$$;

revoke all on function public.tasks_from_payment_claims() from public, anon, authenticated;
revoke all on function public.tasks_from_guardian_links() from public, anon, authenticated;

drop trigger if exists tasks_payment_claims on public.payment_claims;
create trigger tasks_payment_claims
  after insert or update of status on public.payment_claims
  for each row execute function public.tasks_from_payment_claims();

drop trigger if exists tasks_guardian_player_links on public.guardian_player_links;
create trigger tasks_guardian_player_links
  after insert or update of status on public.guardian_player_links
  for each row execute function public.tasks_from_guardian_links();

-- 8. Backfill: open tasks for what is already waiting --------------------------

select public.open_task('payment_claim.pending', 'payment_claim', c.id, 'payment_claim:' || c.id::text)
from public.payment_claims c
where c.status = 'pending';

select public.open_task('guardian_link.pending', 'guardian_link', l.id, 'guardian_link:' || l.id::text)
from public.guardian_player_links l
where l.status = 'pending';
