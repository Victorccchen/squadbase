-- Phase 1 PR-07: venue QR check-in, staff headcount, check-in removal and
-- backfill notices to parents (D11, review Q3). Staging only. Do not run
-- against production.
--
-- * venues: one QR per venue; the token is random and can be regenerated
--   (the old QR stops working at once). Only admins read tokens.
-- * parent_checkin: an approved parent scans the venue QR and checks in one or
--   more children for the session running there now (from 30 minutes before
--   the start until the end). Idempotent; debits by the PR-06 rules.
-- * staff_confirm_headcount: staff record the head count. A count that does
--   not match the present records opens a task for the youth director; it
--   closes once the records match. Sessions with a venue that end without a
--   head count get a task for staff an hour later.
-- * Staff marking a child present (backfill) leaves a notice for the parents
--   (parent_notices). Phase 1 shows it on the credits page; phase 2 sends the
--   same rows over LINE (sent_at). audit_log cannot carry per-parent read
--   state and is admin-only, so notices have their own table.
-- * staff_remove_checkin: removes a wrong check-in and reverses its debit. The
--   credit ledger stays immutable except that attendance_id may be cleared when
--   its attendance row is deleted (ON DELETE SET NULL).

-- 1. Venues ----------------------------------------------------------------------

create or replace function public.new_checkin_token()
returns text
language sql
volatile
as $$
  select replace(gen_random_uuid()::text, '-', '');
$$;

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  checkin_token text not null unique default public.new_checkin_token(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint venues_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint venues_address_length check (address is null or char_length(address) <= 300),
  constraint venues_token_format check (checkin_token ~ '^[0-9a-f]{32}$')
);

comment on table public.venues is
  'Training grounds with a check-in QR. checkin_token is a secret printed on the counter QR; admins only.';

drop trigger if exists venues_set_updated_at on public.venues;
create trigger venues_set_updated_at
  before update on public.venues
  for each row
  execute function public.set_updated_at();

alter table public.venues enable row level security;
revoke all on table public.venues from public, anon;
grant select on table public.venues to authenticated;

drop policy if exists venues_select_admin on public.venues;
create policy venues_select_admin
  on public.venues
  for select
  to authenticated
  using (public.has_role('admin'));

alter table public.training_sessions
  add column if not exists venue_id uuid references public.venues (id) on delete set null;
alter table public.session_series
  add column if not exists venue_id uuid references public.venues (id) on delete set null;

create index if not exists training_sessions_venue_time_idx
  on public.training_sessions (venue_id, starts_at)
  where venue_id is not null and deleted_at is null;

alter table public.training_sessions
  add column if not exists headcount_n integer,
  add column if not exists headcount_confirmed_at timestamptz,
  add column if not exists headcount_confirmed_by uuid references auth.users (id);
alter table public.training_sessions
  drop constraint if exists training_sessions_headcount_range;
alter table public.training_sessions
  add constraint training_sessions_headcount_range check (headcount_n is null or headcount_n between 0 and 500);

-- 2. Attendance source -------------------------------------------------------------

alter table public.session_attendance
  add column if not exists source text not null default 'staff',
  add column if not exists checked_in_at timestamptz;
alter table public.session_attendance
  drop constraint if exists session_attendance_source_check;
alter table public.session_attendance
  add constraint session_attendance_source_check
  check (source in ('staff', 'parent_qr', 'paper_card', 'system'));

comment on column public.session_attendance.source is
  'staff (marked or backfilled by staff), parent_qr (venue QR), paper_card (PR-09 import), system (no-show from finalize).';

-- The ledger may lose its link to an attendance row that staff deleted; nothing
-- else about a ledger row can change.
create or replace function public.session_credit_ledger_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and old.attendance_id is not null
     and new.attendance_id is null
     and (to_jsonb(new) - 'attendance_id') = (to_jsonb(old) - 'attendance_id') then
    return new;
  end if;
  raise exception 'session_credit_ledger is immutable';
end;
$$;

alter table public.session_credit_ledger
  drop constraint if exists session_credit_ledger_attendance_id_fkey;
alter table public.session_credit_ledger
  add constraint session_credit_ledger_attendance_id_fkey
  foreign key (attendance_id) references public.session_attendance (id) on delete set null;

-- 3. Parent notices (outbox) ----------------------------------------------------------

create table if not exists public.parent_notices (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null,
  session_id uuid references public.training_sessions (id) on delete set null,
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  read_by uuid references auth.users (id),
  sent_at timestamptz,
  constraint parent_notices_kind_check check (kind in ('attendance.staff_backfill'))
);

comment on table public.parent_notices is
  'Messages to a player''s parents. Phase 1: shown in the app (read_at). Phase 2: LINE push marks sent_at.';
comment on column public.parent_notices.sent_at is
  'Set by the LINE sender (phase 2). Null = not pushed yet.';

create index if not exists parent_notices_player_idx on public.parent_notices (player_id, created_at desc);
create index if not exists parent_notices_unsent_idx on public.parent_notices (created_at) where sent_at is null;

alter table public.parent_notices enable row level security;
revoke all on table public.parent_notices from public, anon;
grant select on table public.parent_notices to authenticated;

drop policy if exists parent_notices_select on public.parent_notices;
create policy parent_notices_select
  on public.parent_notices
  for select
  to authenticated
  using (public.has_role('admin') or public.is_approved_guardian_for_player(player_id));

create or replace function public.mark_parent_notices_read(p_notice_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.parent_notices n
  set read_at = now(),
      read_by = auth.uid()
  where n.id = any (coalesce(p_notice_ids, array[]::uuid[]))
    and n.read_at is null
    and public.is_approved_guardian_for_player(n.player_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 4. Attendance core with source ----------------------------------------------------

drop function if exists public.apply_session_attendance(uuid, uuid, public.attendance_status, uuid);

create or replace function public.apply_session_attendance(
  p_session_id uuid,
  p_player_id uuid,
  p_status public.attendance_status,
  p_actor uuid,
  p_source text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.training_sessions%rowtype;
  v_team public.teams%rowtype;
  v_existing public.session_attendance%rowtype;
  v_bal public.player_session_balances%rowtype;
  v_plan record;
  v_status public.attendance_status;
  v_leave_approved boolean;
  v_already_match boolean;
  v_reverse_unit numeric(12, 4);
  v_id uuid;
begin
  select * into v_session
  from public.training_sessions
  where id = p_session_id
  for update;
  if not found or v_session.deleted_at is not null then
    raise exception 'session not found';
  end if;

  select * into v_team from public.teams where id = v_session.team_id;

  v_leave_approved := exists (
    select 1
    from public.session_registrations r
    join public.session_leave_requests l on l.registration_id = r.id
    where r.session_id = p_session_id
      and r.player_id = p_player_id
      and r.status in ('registered', 'late_cancelled')
      and l.status = 'approved'
  );

  v_status := p_status;
  if v_leave_approved then
    v_status := 'excused_absent';
  end if;

  select * into v_existing
  from public.session_attendance
  where session_id = p_session_id
    and player_id = p_player_id
  for update;

  perform public.ensure_player_session_balance(p_player_id);
  select * into v_bal
  from public.player_session_balances
  where player_id = p_player_id
  for update;

  if v_existing.id is not null and v_existing.credits_debited > 0 then
    select l.unit_cost_twd into v_reverse_unit
    from public.session_credit_ledger l
    where l.attendance_id = v_existing.id
      and l.amount < 0
    order by l.created_at desc
    limit 1;
    v_reverse_unit := coalesce(v_reverse_unit, v_bal.avg_unit_cost_twd);

    update public.player_session_balances
    set
      credits_available = credits_available + v_existing.credits_debited,
      updated_by = p_actor
    where player_id = p_player_id;

    insert into public.session_credit_ledger (
      player_id, entry_type, amount, unit_cost_twd, amount_twd,
      session_id, attendance_id, actor_user_id, reason
    )
    values (
      p_player_id, 'reversal', v_existing.credits_debited, v_reverse_unit,
      v_existing.credits_debited::numeric * v_reverse_unit,
      p_session_id, v_existing.id, p_actor, 'attendance change reversal'
    );

    select * into v_bal
    from public.player_session_balances
    where player_id = p_player_id;
  end if;

  v_already_match := exists (
    select 1
    from public.session_credit_ledger l
    join public.training_sessions s on s.id = l.session_id
    where l.player_id = p_player_id
      and l.entry_type = 'match_debit'
      and l.session_id is distinct from p_session_id
      and public.club_session_date(s.starts_at) = public.club_session_date(v_session.starts_at)
  );

  select * into v_plan
  from public.compute_session_debit_plan(
    v_session.kind,
    v_team.age_band,
    v_status,
    v_session.no_debit,
    v_session.debit_override_n,
    v_leave_approved,
    v_already_match
  );

  if v_existing.id is null then
    insert into public.session_attendance (
      session_id, player_id, status, credits_debited, marked_by, marked_at, created_by, updated_by,
      source, checked_in_at
    )
    values (
      p_session_id, p_player_id, v_status, v_plan.credits, p_actor, now(), p_actor, p_actor,
      coalesce(p_source, 'staff'),
      case when p_source = 'parent_qr' then now() end
    )
    returning id into v_id;
  else
    update public.session_attendance
    set
      status = v_status,
      credits_debited = v_plan.credits,
      marked_by = p_actor,
      marked_at = now(),
      updated_by = p_actor,
      source = coalesce(p_source, source),
      checked_in_at = case when p_source = 'parent_qr' then now() else checked_in_at end
    where id = v_existing.id
    returning id into v_id;
  end if;

  if v_plan.credits > 0 then
    update public.player_session_balances
    set
      credits_available = credits_available - v_plan.credits,
      updated_by = p_actor
    where player_id = p_player_id;

    -- Owed credits (balance below zero) carry the current average, 0 if the
    -- player never bought; reports flag them as 欠堂.
    insert into public.session_credit_ledger (
      player_id, entry_type, amount, unit_cost_twd, amount_twd,
      session_id, attendance_id, actor_user_id, reason
    )
    values (
      p_player_id, v_plan.entry_type, -v_plan.credits, v_bal.avg_unit_cost_twd,
      v_plan.credits::numeric * v_bal.avg_unit_cost_twd,
      p_session_id, v_id, p_actor, 'attendance debit'
    );
  end if;

  return v_id;
end;
$$;

create or replace function public.finalize_session_attendance_internal(
  p_session_id uuid,
  p_actor uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.training_sessions%rowtype;
  v_player uuid;
  v_count integer := 0;
begin
  select * into v_session
  from public.training_sessions
  where id = p_session_id;
  if not found or v_session.deleted_at is not null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_session.ends_at > now() then
    raise exception 'session has not ended' using errcode = 'P0001';
  end if;

  if v_session.kind is distinct from 'regular' then
    for v_player in
      select distinct r.player_id
      from public.session_registrations r
      where r.session_id = p_session_id
        and r.status in ('registered', 'late_cancelled')
        and not exists (
          select 1 from public.session_attendance a
          where a.session_id = p_session_id and a.player_id = r.player_id
        )
    loop
      perform public.apply_session_attendance(p_session_id, v_player, 'unexcused_absent', p_actor, 'system');
      v_count := v_count + 1;
    end loop;
  end if;

  update public.training_sessions
  set attendance_finalized_at = now()
  where id = p_session_id;

  perform public.write_audit(
    'session.attendance_finalized', 'session', p_session_id, null,
    jsonb_build_object('no_shows_marked', v_count, 'by_job', p_actor is null)
  );

  return v_count;
end;
$$;

-- Head count vs present records: a mismatch is a task for the youth director.
create or replace function public.sync_headcount_task(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.training_sessions%rowtype;
  v_present integer;
begin
  select * into v_session from public.training_sessions where id = p_session_id;
  if v_session.id is null or v_session.headcount_confirmed_at is null then
    return;
  end if;
  select count(*)::integer into v_present
  from public.session_attendance
  where session_id = p_session_id
    and status = 'present';
  if v_present = v_session.headcount_n then
    perform public.close_task_by_key('headcount:' || p_session_id);
  else
    perform public.open_task(
      'attendance.headcount_mismatch', 'session', p_session_id, 'headcount:' || p_session_id,
      'director', null,
      jsonb_build_object('headcount', v_session.headcount_n, 'present', v_present, 'title', v_session.title)
    );
  end if;
end;
$$;

-- Staff attendance. Marking a child present who was not present before is a
-- backfill: the parents get a notice and the audit log a row.
create or replace function public.mark_session_attendance(
  p_session_id uuid,
  p_player_id uuid,
  p_status public.attendance_status
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.training_sessions%rowtype;
  v_before public.attendance_status;
  v_id uuid;
  v_att public.session_attendance%rowtype;
  v_balance integer;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_session
  from public.training_sessions s
  where s.id = p_session_id
    and s.deleted_at is null;
  if v_session.id is null then
    raise exception 'session not found';
  end if;

  if not public.player_active_on_session_team(p_player_id, v_session.team_id) then
    raise exception 'player is not on this session team';
  end if;

  select status into v_before
  from public.session_attendance
  where session_id = p_session_id and player_id = p_player_id;

  v_id := public.apply_session_attendance(p_session_id, p_player_id, p_status, auth.uid(), 'staff');

  select * into v_att from public.session_attendance where id = v_id;
  if v_att.status = 'present' and v_before is distinct from 'present' then
    select credits_available into v_balance
    from public.player_session_balances where player_id = p_player_id;
    insert into public.parent_notices (player_id, kind, session_id, params)
    values (
      p_player_id, 'attendance.staff_backfill', p_session_id,
      jsonb_build_object(
        'session_date', public.club_session_date(v_session.starts_at),
        'session_title', v_session.title,
        'credits_debited', v_att.credits_debited,
        'credits_available', coalesce(v_balance, 0)
      )
    );
    perform public.write_audit(
      'attendance.staff_backfill', 'attendance', v_id, null,
      jsonb_build_object('session_id', p_session_id, 'player_id', p_player_id,
                         'credits_debited', v_att.credits_debited)
    );
  end if;

  perform public.sync_headcount_task(p_session_id);
  return v_id;
end;
$$;

-- 5. Parent QR check-in ----------------------------------------------------------------

-- Sessions open for check-in at a venue now: 30 minutes before the start until the end.
create or replace function public.checkin_open_sessions(p_venue_id uuid)
returns setof public.training_sessions
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.training_sessions s
  where s.venue_id = p_venue_id
    and s.status = 'active'
    and s.deleted_at is null
    and now() >= s.starts_at - interval '30 minutes'
    and now() <= s.ends_at
  order by s.starts_at;
$$;

-- What the check-in page shows: venue, open sessions, and the caller's children
-- with the sessions each may check in to. Null when the token is unknown.
create or replace function public.checkin_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_venue public.venues%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_venue from public.venues where checkin_token = p_token and active;
  if v_venue.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'venue_name', v_venue.name,
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'kind', s.kind, 'team_name', t.name,
        'starts_at', s.starts_at, 'ends_at', s.ends_at
      ) order by s.starts_at)
      from public.checkin_open_sessions(v_venue.id) s
      join public.teams t on t.id = s.team_id
    ), '[]'::jsonb),
    'children', coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id', p.id,
        'name_zh', p.name_zh, 'name_ja', p.name_ja,
        'name_en_given', p.name_en_given, 'name_en_family', p.name_en_family,
        'credits_available', coalesce(b.credits_available, 0),
        'session_ids', coalesce((
          select jsonb_agg(s.id order by s.starts_at)
          from public.checkin_open_sessions(v_venue.id) s
          where public.player_active_on_session_team(p.id, s.team_id)
        ), '[]'::jsonb),
        'checked_in_session_ids', coalesce((
          select jsonb_agg(a.session_id)
          from public.session_attendance a
          join public.checkin_open_sessions(v_venue.id) s on s.id = a.session_id
          where a.player_id = p.id and a.status = 'present'
        ), '[]'::jsonb)
      ) order by p.name_zh)
      from public.players p
      left join public.player_session_balances b on b.player_id = p.id
      where p.id in (
        select l.player_id from public.guardian_player_links l
        where l.guardian_user_id = auth.uid() and l.status = 'approved'
      )
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.parent_checkin(
  p_token text,
  p_player_ids uuid[],
  p_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue public.venues%rowtype;
  v_player uuid;
  v_candidates uuid[];
  v_session uuid;
  v_existing public.session_attendance%rowtype;
  v_att public.session_attendance%rowtype;
  v_result jsonb := '[]'::jsonb;
  v_balance integer;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_venue from public.venues where checkin_token = p_token and active;
  if v_venue.id is null then
    raise exception 'invalid checkin token' using errcode = 'P0002';
  end if;
  if p_player_ids is null or cardinality(p_player_ids) = 0 then
    raise exception 'no players selected' using errcode = '22023';
  end if;
  if cardinality(p_player_ids) > 10 then
    raise exception 'too many players' using errcode = '22023';
  end if;

  foreach v_player in array p_player_ids loop
    if not public.is_approved_guardian_for_player(v_player) then
      raise exception 'not an approved guardian' using errcode = '42501';
    end if;
  end loop;

  foreach v_player in array (select array_agg(distinct x) from unnest(p_player_ids) as x) loop
    select array_agg(s.id order by s.starts_at) into v_candidates
    from public.checkin_open_sessions(v_venue.id) s
    where public.player_active_on_session_team(v_player, s.team_id)
      and (p_session_id is null or s.id = p_session_id);

    if v_candidates is null then
      v_result := v_result || jsonb_build_object('player_id', v_player, 'result', 'no_session');
      continue;
    end if;
    if cardinality(v_candidates) > 1 then
      v_result := v_result || jsonb_build_object(
        'player_id', v_player, 'result', 'choose', 'session_ids', to_jsonb(v_candidates));
      continue;
    end if;

    v_session := v_candidates[1];
    select * into v_existing
    from public.session_attendance
    where session_id = v_session and player_id = v_player;

    if v_existing.id is not null and v_existing.status = 'present' then
      select credits_available into v_balance from public.player_session_balances where player_id = v_player;
      v_result := v_result || jsonb_build_object(
        'player_id', v_player, 'result', 'already', 'session_id', v_session,
        'credits_debited', v_existing.credits_debited, 'credits_available', coalesce(v_balance, 0));
      continue;
    end if;

    perform public.apply_session_attendance(v_session, v_player, 'present', auth.uid(), 'parent_qr');
    select * into v_att from public.session_attendance where session_id = v_session and player_id = v_player;
    select credits_available into v_balance from public.player_session_balances where player_id = v_player;
    v_result := v_result || jsonb_build_object(
      'player_id', v_player, 'result', 'checked_in', 'session_id', v_session,
      'credits_debited', v_att.credits_debited, 'credits_available', coalesce(v_balance, 0));
    perform public.sync_headcount_task(v_session);
  end loop;

  return v_result;
end;
$$;

-- 6. Staff: head count, remove a check-in ------------------------------------------------

create or replace function public.staff_confirm_headcount(p_session_id uuid, p_headcount integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.training_sessions%rowtype;
  v_present integer;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_headcount is null or p_headcount < 0 or p_headcount > 500 then
    raise exception 'invalid headcount' using errcode = '22023';
  end if;
  select * into v_session from public.training_sessions where id = p_session_id and deleted_at is null;
  if v_session.id is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  update public.training_sessions
  set headcount_n = p_headcount,
      headcount_confirmed_at = now(),
      headcount_confirmed_by = auth.uid()
  where id = p_session_id;

  perform public.close_task_by_key('headcount_missing:' || p_session_id);

  -- No-shows can only be settled once the session is over.
  if v_session.ends_at <= now() then
    perform public.finalize_session_attendance_internal(p_session_id, auth.uid());
  end if;

  perform public.sync_headcount_task(p_session_id);

  select count(*)::integer into v_present
  from public.session_attendance where session_id = p_session_id and status = 'present';

  perform public.write_audit(
    'session.headcount_confirmed', 'session', p_session_id,
    case when v_session.headcount_confirmed_at is null then null
         else jsonb_build_object('headcount', v_session.headcount_n) end,
    jsonb_build_object('headcount', p_headcount, 'present', v_present)
  );

  return jsonb_build_object('headcount', p_headcount, 'present', v_present, 'mismatch', v_present <> p_headcount);
end;
$$;

-- "Checked in but did not come": delete the attendance and reverse its debit.
create or replace function public.staff_remove_checkin(
  p_session_id uuid,
  p_player_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.session_attendance%rowtype;
  v_unit numeric(12, 4);
  v_reason text;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 2 then
    raise exception 'reason required' using errcode = '22023';
  end if;
  v_reason := left(v_reason, 300);

  select * into v_att
  from public.session_attendance
  where session_id = p_session_id and player_id = p_player_id
  for update;
  if v_att.id is null then
    raise exception 'attendance not found' using errcode = 'P0002';
  end if;

  if v_att.credits_debited > 0 then
    select l.unit_cost_twd into v_unit
    from public.session_credit_ledger l
    where l.attendance_id = v_att.id and l.amount < 0
    order by l.created_at desc
    limit 1;

    perform public.ensure_player_session_balance(p_player_id);
    update public.player_session_balances
    set credits_available = credits_available + v_att.credits_debited,
        updated_by = auth.uid()
    where player_id = p_player_id;

    insert into public.session_credit_ledger (
      player_id, entry_type, amount, unit_cost_twd, amount_twd,
      session_id, attendance_id, actor_user_id, reason
    )
    values (
      p_player_id, 'reversal', v_att.credits_debited, coalesce(v_unit, 0),
      v_att.credits_debited::numeric * coalesce(v_unit, 0),
      p_session_id, v_att.id, auth.uid(), left('check-in removed: ' || v_reason, 500)
    );
  end if;

  perform public.write_audit(
    'attendance.checkin_removed', 'attendance', v_att.id,
    jsonb_build_object('session_id', p_session_id, 'player_id', p_player_id, 'status', v_att.status,
                       'source', v_att.source, 'credits_debited', v_att.credits_debited),
    jsonb_build_object('reason', v_reason)
  );

  delete from public.session_attendance where id = v_att.id;

  perform public.sync_headcount_task(p_session_id);
end;
$$;

-- 7. Venue admin -------------------------------------------------------------------------

create or replace function public.admin_upsert_venue(
  p_id uuid,
  p_name text,
  p_address text,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(v_name) < 1 then
    raise exception 'venue name required' using errcode = '22023';
  end if;
  v_name := left(v_name, 120);
  v_address := left(v_address, 300);

  if p_id is null then
    insert into public.venues (name, address, active, created_by, updated_by)
    values (v_name, v_address, coalesce(p_active, true), auth.uid(), auth.uid())
    returning id into v_id;
  else
    update public.venues
    set name = v_name, address = v_address, active = coalesce(p_active, active), updated_by = auth.uid()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'venue not found' using errcode = 'P0002';
    end if;
  end if;

  perform public.write_audit('venue.upsert', 'venue', v_id, null,
    jsonb_build_object('name', v_name, 'active', coalesce(p_active, true)));
  return v_id;
end;
$$;

-- New token: the printed QR stops working immediately.
create or replace function public.admin_regenerate_venue_token(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.venues
  set checkin_token = public.new_checkin_token(), updated_by = auth.uid()
  where id = p_id;
  if not found then
    raise exception 'venue not found' using errcode = 'P0002';
  end if;
  perform public.write_audit('venue.token_regenerated', 'venue', p_id, null, null);
end;
$$;

-- Venue for one session, or for a series from that session on.
create or replace function public.admin_set_session_venue(
  p_session_id uuid,
  p_venue_id uuid,
  p_whole_series boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.training_sessions%rowtype;
  v_count integer;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_session from public.training_sessions where id = p_session_id and deleted_at is null;
  if v_session.id is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if p_venue_id is not null and not exists (select 1 from public.venues where id = p_venue_id) then
    raise exception 'venue not found' using errcode = 'P0002';
  end if;

  if coalesce(p_whole_series, false) and v_session.series_id is not null then
    update public.session_series set venue_id = p_venue_id, updated_by = auth.uid()
    where id = v_session.series_id;
    update public.training_sessions
    set venue_id = p_venue_id, updated_by = auth.uid()
    where series_id = v_session.series_id
      and deleted_at is null
      and starts_at >= v_session.starts_at;
  else
    update public.training_sessions
    set venue_id = p_venue_id, updated_by = auth.uid()
    where id = p_session_id;
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 8. Job: settle no-shows; flag venue sessions with no head count -------------------------

create or replace function public.finalize_due_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_done integer := 0;
begin
  for v_row in
    select s.id
    from public.training_sessions s
    where s.attendance_finalized_at is null
      and s.deleted_at is null
      and s.ends_at <= now() - interval '24 hours'
    order by s.ends_at
    limit 200
  loop
    perform public.finalize_session_attendance_internal(v_row.id, null);
    v_done := v_done + 1;
  end loop;

  for v_row in
    select s.id, s.title
    from public.training_sessions s
    where s.venue_id is not null
      and s.headcount_confirmed_at is null
      and s.deleted_at is null
      and s.status = 'active'
      and s.ends_at <= now() - interval '1 hour'
      and s.ends_at > now() - interval '7 days'
  loop
    perform public.open_task(
      'attendance.headcount_missing', 'session', v_row.id, 'headcount_missing:' || v_row.id,
      'admin', null, jsonb_build_object('title', v_row.title)
    );
  end loop;

  return v_done;
end;
$$;

-- 9. Grants ---------------------------------------------------------------------------------

revoke all on function public.new_checkin_token() from public, anon, authenticated;
revoke all on function public.apply_session_attendance(uuid, uuid, public.attendance_status, uuid, text) from public, anon, authenticated;
revoke all on function public.finalize_session_attendance_internal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finalize_due_sessions() from public, anon, authenticated;
revoke all on function public.sync_headcount_task(uuid) from public, anon, authenticated;
revoke all on function public.checkin_open_sessions(uuid) from public, anon, authenticated;
revoke all on function public.mark_session_attendance(uuid, uuid, public.attendance_status) from public, anon;
revoke all on function public.checkin_preview(text) from public, anon;
revoke all on function public.parent_checkin(text, uuid[], uuid) from public, anon;
revoke all on function public.staff_confirm_headcount(uuid, integer) from public, anon;
revoke all on function public.staff_remove_checkin(uuid, uuid, text) from public, anon;
revoke all on function public.admin_upsert_venue(uuid, text, text, boolean) from public, anon;
revoke all on function public.admin_regenerate_venue_token(uuid) from public, anon;
revoke all on function public.admin_set_session_venue(uuid, uuid, boolean) from public, anon;
revoke all on function public.mark_parent_notices_read(uuid[]) from public, anon;

grant execute on function public.mark_session_attendance(uuid, uuid, public.attendance_status) to authenticated;
grant execute on function public.checkin_preview(text) to authenticated;
grant execute on function public.parent_checkin(text, uuid[], uuid) to authenticated;
grant execute on function public.staff_confirm_headcount(uuid, integer) to authenticated;
grant execute on function public.staff_remove_checkin(uuid, uuid, text) to authenticated;
grant execute on function public.admin_upsert_venue(uuid, text, text, boolean) to authenticated;
grant execute on function public.admin_regenerate_venue_token(uuid) to authenticated;
grant execute on function public.admin_set_session_venue(uuid, uuid, boolean) to authenticated;
grant execute on function public.mark_parent_notices_read(uuid[]) to authenticated;
