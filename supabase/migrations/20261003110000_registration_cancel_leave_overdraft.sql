-- Phase 1 PR-06: registration, cancel, leave and overdraft rules
-- (D1, D2, D2-1, D3, D9). Staging only. Do not run against production.
--
-- * Parents may cancel any time. Special sessions and matches cancelled within
--   24 hours of the start become late_cancelled and count as a no-show unless
--   staff approve a leave request (illness, injury, ...).
-- * finalize_session_attendance marks registered or late-cancelled players who
--   never got an attendance row as unexcused_absent after a special session or
--   match ends. Staff can run it per session; pg_cron runs it 24 hours after
--   the end for sessions nobody closed.
-- * Overdraft (D3): attendance never fails for lack of credits. Balances may go
--   negative; at -3 or below, new registrations for credit sessions are refused
--   (credit_limit_reached). A purchase on a balance at or below zero sets the
--   average unit cost to the new package price.
-- * Tasks: renewal reminder at 0 or below (staff), limit reached at -3 or below
--   (youth director), pending leave requests (staff). They close by themselves.
-- * Registrations and cancels go through the RPCs only: the guardian table
--   insert/update policies bypassed the team check, the 24-hour rule and the
--   credit limit.
--
-- The debit table itself (compute_session_debit_plan) does not change.

-- 1. Constants and columns ----------------------------------------------------

create or replace function public.credit_overdraft_limit()
returns integer
language sql
immutable
as $$
  select 3;
$$;

comment on function public.credit_overdraft_limit() is
  'D3: owed credits allowed before new registrations are refused (balance <= -limit blocks).';

alter table public.session_registrations
  add column if not exists cancelled_at timestamptz;

alter table public.training_sessions
  add column if not exists attendance_finalized_at timestamptz;

comment on column public.training_sessions.attendance_finalized_at is
  'Set when finalize_session_attendance ran (staff button or the 24-hour job). Sessions that ended before PR-06 are marked finalized on deploy.';

-- Historical sessions are not finalized retroactively.
update public.training_sessions
set attendance_finalized_at = now()
where attendance_finalized_at is null
  and ends_at <= now();

create index if not exists training_sessions_finalize_due_idx
  on public.training_sessions (ends_at)
  where attendance_finalized_at is null and deleted_at is null;

alter table public.session_leave_requests
  add column if not exists reason_category text;
alter table public.session_leave_requests
  drop constraint if exists session_leave_requests_reason_category_check;
alter table public.session_leave_requests
  add constraint session_leave_requests_reason_category_check
  check (reason_category is null or reason_category in ('illness', 'injury', 'family', 'school', 'other'));

alter table public.player_session_balances
  drop constraint if exists player_session_balances_credits_nonneg;
alter table public.player_session_balances
  drop constraint if exists player_session_balances_credits_floor;
alter table public.player_session_balances
  add constraint player_session_balances_credits_floor check (credits_available >= -100);

-- 2. Registrations through RPCs only -------------------------------------------

drop policy if exists session_registrations_insert_approved_guardian on public.session_registrations;
drop policy if exists session_registrations_update_approved_guardian_cancel on public.session_registrations;

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
  v_band public.age_band;
  v_balance integer;
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

  if not public.player_active_on_session_team(p_player_id, session_team) then
    raise exception 'player is not on this session team' using errcode = 'P0001';
  end if;

  -- D3: owing the limit or more blocks new sign-ups for sessions that debit.
  select t.age_band into v_band from public.teams t where t.id = session_team;
  if public.credits_apply_to_age_band(v_band) then
    select b.credits_available into v_balance
    from public.player_session_balances b
    where b.player_id = p_player_id;
    if coalesce(v_balance, 0) <= -public.credit_overdraft_limit() then
      raise exception 'credit_limit_reached' using errcode = 'P0001';
    end if;
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
    session_id, player_id, guardian_user_id, status, parent_note, created_by, updated_by
  )
  values (
    p_session_id, p_player_id, auth.uid(), 'registered', note, auth.uid(), auth.uid()
  )
  returning id into new_id;

  return new_id;
exception
  when unique_violation then
    raise exception 'already registered' using errcode = '23505';
end;
$$;

-- Parents cancel any time. Special/match within 24 hours of the start (or after
-- it) → late_cancelled. Admin cancels are always plain cancels.
create or replace function public.cancel_session_registration(p_registration_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_player uuid;
  v_starts_at timestamptz;
  v_kind public.session_kind;
  v_new public.session_registration_status := 'cancelled';
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select r.player_id, s.starts_at, s.kind
    into target_player, v_starts_at, v_kind
  from public.session_registrations r
  join public.training_sessions s on s.id = r.session_id
  where r.id = p_registration_id
    and r.status = 'registered';

  if target_player is null then
    raise exception 'registration not found' using errcode = 'P0002';
  end if;

  if not public.is_approved_guardian_for_player(target_player)
     and not public.has_role('admin') then
    raise exception 'cannot cancel registration' using errcode = '42501';
  end if;

  if not public.has_role('admin')
     and v_kind is distinct from 'regular'
     and v_starts_at <= now() + interval '24 hours' then
    v_new := 'late_cancelled';
  end if;

  update public.session_registrations
  set
    status = v_new,
    cancelled_at = now(),
    updated_by = auth.uid()
  where id = p_registration_id
    and status = 'registered';

  if not found then
    raise exception 'cannot cancel registration' using errcode = 'P0001';
  end if;

  return p_registration_id;
end;
$$;

comment on function public.cancel_session_registration(uuid) is
  'Approved guardian (or admin) cancels an open registration. Special/match within 24 hours of start by a guardian → late_cancelled (counts as a no-show unless leave is approved). History row stays; the pair may re-register.';

-- 3. Attendance core -----------------------------------------------------------
-- Shared by staff attendance, finalize and leave approval. No authorization
-- here; callers check it. Never fails for lack of credits (D3). A reversal uses
-- the unit cost of the debit it reverses.

create or replace function public.apply_session_attendance(
  p_session_id uuid,
  p_player_id uuid,
  p_status public.attendance_status,
  p_actor uuid
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
      session_id, player_id, status, credits_debited, marked_by, marked_at, created_by, updated_by
    )
    values (
      p_session_id, p_player_id, v_status, v_plan.credits, p_actor, now(), p_actor, p_actor
    )
    returning id into v_id;
  else
    update public.session_attendance
    set
      status = v_status,
      credits_debited = v_plan.credits,
      marked_by = p_actor,
      marked_at = now(),
      updated_by = p_actor
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

-- Staff attendance (admin only since PR-04).
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
  v_team uuid;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select s.team_id into v_team
  from public.training_sessions s
  where s.id = p_session_id
    and s.deleted_at is null;
  if v_team is null then
    raise exception 'session not found';
  end if;

  if not public.player_active_on_session_team(p_player_id, v_team) then
    raise exception 'player is not on this session team';
  end if;

  return public.apply_session_attendance(p_session_id, p_player_id, p_status, auth.uid());
end;
$$;

-- 4. Finalize: no-shows on special sessions and matches -----------------------

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
      perform public.apply_session_attendance(p_session_id, v_player, 'unexcused_absent', p_actor);
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

create or replace function public.finalize_session_attendance(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return public.finalize_session_attendance_internal(p_session_id, auth.uid());
end;
$$;

-- Job: sessions that ended more than 24 hours ago and nobody finalized.
create or replace function public.finalize_due_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_done integer := 0;
begin
  for v_id in
    select s.id
    from public.training_sessions s
    where s.attendance_finalized_at is null
      and s.deleted_at is null
      and s.ends_at <= now() - interval '24 hours'
    order by s.ends_at
    limit 200
  loop
    perform public.finalize_session_attendance_internal(v_id, null);
    v_done := v_done + 1;
  end loop;
  return v_done;
end;
$$;

-- 5. Leave requests --------------------------------------------------------------

drop function if exists public.request_excused_leave(uuid, text);

create or replace function public.request_excused_leave(
  p_registration_id uuid,
  p_parent_note text default null,
  p_reason_category text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg public.session_registrations%rowtype;
  v_id uuid;
  v_note text;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_reg
  from public.session_registrations
  where id = p_registration_id;
  if not found or v_reg.status not in ('registered', 'late_cancelled') then
    raise exception 'registration not found';
  end if;
  if not public.is_approved_guardian_for_player(v_reg.player_id) then
    raise exception 'not an approved guardian';
  end if;
  if p_reason_category is not null
     and p_reason_category not in ('illness', 'injury', 'family', 'school', 'other') then
    raise exception 'invalid leave reason' using errcode = '22023';
  end if;

  v_note := nullif(btrim(coalesce(p_parent_note, '')), '');
  if v_note is not null then
    v_note := left(v_note, 1000);
  end if;

  insert into public.session_leave_requests (
    registration_id, status, parent_note, reason_category, created_by, updated_by
  )
  values (
    p_registration_id, 'pending', v_note, p_reason_category, auth.uid(), auth.uid()
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'already has a pending leave request';
end;
$$;

-- Approval reverses a no-show debit already taken (finalize ran first).
create or replace function public.staff_review_leave_request(
  p_request_id uuid,
  p_status public.leave_request_status,
  p_admin_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.session_leave_requests%rowtype;
  v_reg public.session_registrations%rowtype;
  v_att public.session_attendance%rowtype;
  v_note text;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'invalid decision';
  end if;

  select * into v_req
  from public.session_leave_requests
  where id = p_request_id
  for update;
  if not found or v_req.status is distinct from 'pending' then
    raise exception 'leave request not found or not pending';
  end if;

  v_note := nullif(btrim(coalesce(p_admin_note, '')), '');
  if v_note is not null then
    v_note := left(v_note, 1000);
  end if;

  update public.session_leave_requests
  set
    status = p_status,
    admin_note = v_note,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_by = auth.uid()
  where id = p_request_id;

  perform public.write_audit(
    'leave_request.' || p_status::text, 'leave_request', p_request_id,
    jsonb_build_object('status', v_req.status),
    jsonb_build_object('status', p_status, 'reason_category', v_req.reason_category, 'admin_note', v_note)
  );

  if p_status = 'approved' then
    select * into v_reg from public.session_registrations where id = v_req.registration_id;
    select * into v_att
    from public.session_attendance
    where session_id = v_reg.session_id
      and player_id = v_reg.player_id;
    if v_att.id is not null and v_att.status = 'unexcused_absent' then
      perform public.apply_session_attendance(v_reg.session_id, v_reg.player_id, 'excused_absent', auth.uid());
    end if;
  end if;

  return p_request_id;
end;
$$;

create or replace function public.leave_request_task_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg public.session_registrations%rowtype;
begin
  if new.status = 'pending' then
    select * into v_reg from public.session_registrations where id = new.registration_id;
    perform public.open_task(
      'leave_request.pending', 'leave_request', new.id, 'leave_request:' || new.id, 'staff', null,
      jsonb_build_object(
        'registration_id', new.registration_id,
        'session_id', v_reg.session_id,
        'player_id', v_reg.player_id,
        'reason_category', new.reason_category
      )
    );
  elsif tg_op = 'UPDATE' and old.status = 'pending' then
    perform public.close_task_by_key('leave_request:' || new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists session_leave_requests_task_sync on public.session_leave_requests;
create trigger session_leave_requests_task_sync
  after insert or update of status on public.session_leave_requests
  for each row
  execute function public.leave_request_task_sync();

-- 6. Money: purchases on a negative balance, admin adjustments -----------------

create or replace function public.admin_review_payment_claim(
  p_claim_id uuid,
  p_status public.payment_claim_status,
  p_admin_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.payment_claims%rowtype;
  v_bal public.player_session_balances%rowtype;
  v_unit numeric(12, 4);
  v_new_avg numeric(12, 4);
  v_note text;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'invalid decision';
  end if;

  v_note := nullif(btrim(coalesce(p_admin_note, '')), '');
  if v_note is not null then
    v_note := left(v_note, 1000);
  end if;

  select * into v_claim
  from public.payment_claims
  where id = p_claim_id
  for update;
  if not found or v_claim.status is distinct from 'pending' then
    raise exception 'claim not found or not pending';
  end if;

  update public.payment_claims
  set
    status = p_status,
    admin_note = v_note,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_by = auth.uid()
  where id = p_claim_id;

  if p_status = 'rejected' then
    return p_claim_id;
  end if;

  perform public.ensure_player_session_balance(v_claim.player_id);

  select * into v_bal
  from public.player_session_balances
  where player_id = v_claim.player_id
  for update;

  v_unit := (v_claim.price_twd_snapshot::numeric / v_claim.credits_snapshot::numeric);
  -- PR-06: at or below zero there is no stock left to average with; the
  -- weighted formula would divide by the wrong count (or by zero).
  if v_bal.credits_available <= 0 then
    v_new_avg := v_unit;
  else
    v_new_avg := (
      (v_bal.credits_available::numeric * v_bal.avg_unit_cost_twd)
      + (v_claim.credits_snapshot::numeric * v_unit)
    ) / (v_bal.credits_available + v_claim.credits_snapshot)::numeric;
  end if;

  update public.player_session_balances
  set
    credits_available = credits_available + v_claim.credits_snapshot,
    avg_unit_cost_twd = v_new_avg,
    updated_by = auth.uid()
  where player_id = v_claim.player_id;

  insert into public.session_credit_ledger (
    player_id, entry_type, amount, unit_cost_twd, amount_twd,
    package_id, claim_id, actor_user_id, reason
  )
  values (
    v_claim.player_id, 'purchase', v_claim.credits_snapshot, v_unit, v_claim.price_twd_snapshot,
    v_claim.package_id, v_claim.id, auth.uid(), 'payment claim approved'
  );

  return p_claim_id;
end;
$$;

-- A positive adjustment may now start from a negative balance; a negative one
-- still cannot push the balance below zero.
create or replace function public.admin_adjust_session_credits(
  p_player_id uuid,
  p_amount integer,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal public.player_session_balances%rowtype;
  v_reason text;
  v_id uuid;
  v_new_avg numeric(12, 4);
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'invalid credit amount';
  end if;
  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 3 then
    raise exception 'reason required';
  end if;
  v_reason := left(v_reason, 500);

  perform public.ensure_player_session_balance(p_player_id);

  select * into v_bal
  from public.player_session_balances
  where player_id = p_player_id
  for update;

  if p_amount < 0 and v_bal.credits_available + p_amount < 0 then
    raise exception 'adjust would be negative';
  end if;

  v_new_avg := v_bal.avg_unit_cost_twd;

  update public.player_session_balances
  set
    credits_available = credits_available + p_amount,
    avg_unit_cost_twd = v_new_avg,
    updated_by = auth.uid()
  where player_id = p_player_id;

  insert into public.session_credit_ledger (
    player_id, entry_type, amount, unit_cost_twd, amount_twd, actor_user_id, reason
  )
  values (
    p_player_id, 'admin_adjust', p_amount, v_new_avg,
    abs(p_amount)::numeric * v_new_avg, auth.uid(), v_reason
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- 7. Balance tasks -----------------------------------------------------------------
-- Open on a debit that leaves the balance at 0 or below; close when it is back
-- above zero (or above the limit for the director's task).

create or replace function public.player_balance_task_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid := new.player_id;
begin
  if new.credits_available > 0 then
    perform public.close_task_by_key('credits_renew:' || v_pid);
    perform public.close_task_by_key('credits_limit:' || v_pid);
    return new;
  end if;

  if new.credits_available > -public.credit_overdraft_limit() then
    perform public.close_task_by_key('credits_limit:' || v_pid);
  end if;

  if tg_op = 'UPDATE' and new.credits_available < old.credits_available then
    perform public.open_task(
      'credits.renew', 'player', v_pid, 'credits_renew:' || v_pid, 'staff', null,
      jsonb_build_object('credits_available', new.credits_available)
    );
    if new.credits_available <= -public.credit_overdraft_limit() then
      perform public.open_task(
        'credits.limit_reached', 'player', v_pid, 'credits_limit:' || v_pid, 'director', null,
        jsonb_build_object('credits_available', new.credits_available)
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists player_session_balances_task_sync on public.player_session_balances;
create trigger player_session_balances_task_sync
  after insert or update of credits_available on public.player_session_balances
  for each row
  execute function public.player_balance_task_sync();

-- 8. Schedule the 24-hour finalize job where pg_cron exists ---------------------
-- Supabase ships pg_cron. Local stand-ins without it skip this block. Check on
-- staging with: select jobname, schedule from cron.job;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if exists (select 1 from cron.job where jobname = 'finalize-session-attendance') then
      perform cron.unschedule('finalize-session-attendance');
    end if;
    perform cron.schedule(
      'finalize-session-attendance',
      '17 * * * *',
      'select public.finalize_due_sessions()'
    );
  else
    raise notice 'pg_cron not available: finalize_due_sessions is not scheduled';
  end if;
end;
$$;

-- 9. Grants -------------------------------------------------------------------------

revoke all on function public.credit_overdraft_limit() from public, anon;
revoke all on function public.apply_session_attendance(uuid, uuid, public.attendance_status, uuid) from public, anon, authenticated;
revoke all on function public.finalize_session_attendance_internal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finalize_due_sessions() from public, anon, authenticated;
revoke all on function public.leave_request_task_sync() from public, anon, authenticated;
revoke all on function public.player_balance_task_sync() from public, anon, authenticated;
revoke all on function public.register_player_for_session(uuid, uuid, text) from public, anon;
revoke all on function public.cancel_session_registration(uuid) from public, anon;
revoke all on function public.mark_session_attendance(uuid, uuid, public.attendance_status) from public, anon;
revoke all on function public.finalize_session_attendance(uuid) from public, anon;
revoke all on function public.request_excused_leave(uuid, text, text) from public, anon;
revoke all on function public.staff_review_leave_request(uuid, public.leave_request_status, text) from public, anon;
revoke all on function public.admin_review_payment_claim(uuid, public.payment_claim_status, text) from public, anon;
revoke all on function public.admin_adjust_session_credits(uuid, integer, text) from public, anon;

grant execute on function public.credit_overdraft_limit() to authenticated;
grant execute on function public.register_player_for_session(uuid, uuid, text) to authenticated;
grant execute on function public.cancel_session_registration(uuid) to authenticated;
grant execute on function public.mark_session_attendance(uuid, uuid, public.attendance_status) to authenticated;
grant execute on function public.finalize_session_attendance(uuid) to authenticated;
grant execute on function public.request_excused_leave(uuid, text, text) to authenticated;
grant execute on function public.staff_review_leave_request(uuid, public.leave_request_status, text) to authenticated;
grant execute on function public.admin_review_payment_claim(uuid, public.payment_claim_status, text) to authenticated;
grant execute on function public.admin_adjust_session_credits(uuid, integer, text) to authenticated;
