-- Phase 1 PR-04: coaches coach; staff run operations.
--
-- * mark_session_attendance (which debits credits) is admin-only. Body is the
--   Stage 4B version unchanged apart from the authorization check.
-- * Coaches no longer read player_session_balances (families' paid credits).
--   They keep read access to rosters, photos and assessments for their teams.
-- * profiles.preferred_language: the language a person uses with the club
--   (decision D6). Set on first sign-in from the page locale; changeable in
--   settings through set_preferred_language.
--
-- Apply on staging only (Database (staging) workflow).

-- 1. Attendance: admin only ---------------------------------------------------

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
  v_team public.teams%rowtype;
  v_existing public.session_attendance%rowtype;
  v_bal public.player_session_balances%rowtype;
  v_plan record;
  v_status public.attendance_status;
  v_leave_approved boolean;
  v_already_match boolean;
  v_id uuid;
  v_actor uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_session
  from public.training_sessions
  where id = p_session_id
  for update;
  if not found or v_session.deleted_at is not null then
    raise exception 'session not found';
  end if;

  -- Phase 1 PR-04: coaches no longer take attendance (staff do; PR-07 adds
  -- parent QR check-in through its own RPC).
  if not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not public.player_active_on_session_team(p_player_id, v_session.team_id) then
    raise exception 'player is not on this session team';
  end if;

  select * into v_team from public.teams where id = v_session.team_id;

  v_leave_approved := exists (
    select 1
    from public.session_registrations r
    join public.session_leave_requests l on l.registration_id = r.id
    where r.session_id = p_session_id
      and r.player_id = p_player_id
      and r.status = 'registered'
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
    update public.player_session_balances
    set
      credits_available = credits_available + v_existing.credits_debited,
      updated_by = v_actor
    where player_id = p_player_id;

    insert into public.session_credit_ledger (
      player_id,
      entry_type,
      amount,
      unit_cost_twd,
      amount_twd,
      session_id,
      attendance_id,
      actor_user_id,
      reason
    )
    values (
      p_player_id,
      'reversal',
      v_existing.credits_debited,
      v_bal.avg_unit_cost_twd,
      v_existing.credits_debited::numeric * v_bal.avg_unit_cost_twd,
      p_session_id,
      v_existing.id,
      v_actor,
      'attendance change reversal'
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

  if v_plan.credits > 0 and v_bal.credits_available < v_plan.credits then
    raise exception 'insufficient credits';
  end if;

  if v_existing.id is null then
    insert into public.session_attendance (
      session_id,
      player_id,
      status,
      credits_debited,
      marked_by,
      marked_at,
      created_by,
      updated_by
    )
    values (
      p_session_id,
      p_player_id,
      v_status,
      v_plan.credits,
      v_actor,
      now(),
      v_actor,
      v_actor
    )
    returning id into v_id;
  else
    update public.session_attendance
    set
      status = v_status,
      credits_debited = v_plan.credits,
      marked_by = v_actor,
      marked_at = now(),
      updated_by = v_actor
    where id = v_existing.id
    returning id into v_id;
  end if;

  if v_plan.credits > 0 then
    update public.player_session_balances
    set
      credits_available = credits_available - v_plan.credits,
      updated_by = v_actor
    where player_id = p_player_id;

    insert into public.session_credit_ledger (
      player_id,
      entry_type,
      amount,
      unit_cost_twd,
      amount_twd,
      session_id,
      attendance_id,
      actor_user_id,
      reason
    )
    values (
      p_player_id,
      v_plan.entry_type,
      -v_plan.credits,
      v_bal.avg_unit_cost_twd,
      v_plan.credits::numeric * v_bal.avg_unit_cost_twd,
      p_session_id,
      v_id,
      v_actor,
      'attendance debit'
    );
  end if;

  return v_id;
end;
$$;


revoke all on function public.mark_session_attendance(uuid, uuid, public.attendance_status) from public, anon;
grant execute on function public.mark_session_attendance(uuid, uuid, public.attendance_status) to authenticated;

-- 2. Balances: no coach read --------------------------------------------------

drop policy if exists player_session_balances_select on public.player_session_balances;
create policy player_session_balances_select
  on public.player_session_balances
  for select
  to authenticated
  using (
    public.has_role('admin')
    or public.is_approved_guardian_for_player(player_id)
  );

-- 3. Preferred language ------------------------------------------------------

alter table public.profiles
  add column if not exists preferred_language text;

alter table public.profiles
  drop constraint if exists profiles_preferred_language_valid;
alter table public.profiles
  add constraint profiles_preferred_language_valid
  check (preferred_language is null or preferred_language in ('zh-Hant', 'ja', 'en'));

comment on column public.profiles.preferred_language is
  'Language for messages to this person (zh-Hant / ja / en). Null until first sign-in.';

-- Sets the caller's own language. With p_only_if_unset, keeps an existing choice
-- (used at sign-in so a later locale switch in the URL does not overwrite it).
create or replace function public.set_preferred_language(
  p_language text,
  p_only_if_unset boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_language is null or p_language not in ('zh-Hant', 'ja', 'en') then
    raise exception 'invalid language' using errcode = 'P0001';
  end if;

  select preferred_language into v_current from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if p_only_if_unset and v_current is not null then
    return v_current;
  end if;

  update public.profiles
  set preferred_language = p_language, updated_at = now(), updated_by = auth.uid()
  where id = auth.uid();
  return p_language;
end;
$$;

revoke all on function public.set_preferred_language(text, boolean) from public, anon;
grant execute on function public.set_preferred_language(text, boolean) to authenticated;
