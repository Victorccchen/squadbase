-- Phase 1 PR-06 verification: cancel, late cancel, finalize, leave, overdraft.
-- Self-contained; rolls back. Staging SQL Editor or CI (scripts/db-verify.sh).
-- Do not run against production. Synthetic names only.

begin;

create function pg_temp.as_user(p_uid uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true);
$$;

create function pg_temp.at_club(p_days_ago integer, p_hour integer)
returns timestamptz
language sql
as $$
  select ((public.club_today() - p_days_ago)::timestamp + make_interval(hours => p_hour)) at time zone 'Asia/Taipei';
$$;

create function pg_temp.new_session(p_team uuid, p_kind public.session_kind, p_starts timestamptz, p_title text)
returns uuid
language sql
as $$
  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind)
  values (p_team, p_starts, p_starts + interval '90 minutes', p_title, p_kind)
  returning id;
$$;

create function pg_temp.balance(p_player uuid)
returns integer
language sql
as $$
  select credits_available from public.player_session_balances where player_id = p_player;
$$;

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_parent uuid := gen_random_uuid();
  v_squad uuid;
  v_match_team uuid;
  v_player uuid;
  v_birth date;
  v_pkg10 uuid;
  v_pkg30 uuid;
  v_claim uuid;
  v_s uuid;
  v_s2 uuid;
  v_reg uuid;
  v_leave uuid;
  v_before integer;
  v_att public.session_attendance%rowtype;
  v_status public.session_registration_status;
  v_task public.tasks%rowtype;
  v_unit numeric;
  v_rows integer;
  v_failed boolean;
begin
  insert into auth.users (id) values (v_admin), (v_parent);
  perform pg_temp.as_user(v_admin);
  perform public.ensure_own_profile();
  perform pg_temp.as_user(v_parent);
  perform public.ensure_own_profile();
  insert into public.user_roles (user_id, role) values (v_admin, 'admin') on conflict do nothing;

  select d::date into v_birth
  from generate_series(public.club_today() - interval '9 years', public.club_today() - interval '5 years', interval '1 month') as g(d)
  where public.age_squad_band_from_birth_date(d::date, public.club_today()) = 'U8'
    and public.birth_age_label_from_birth_date(d::date, public.club_today()) = 'U8'
  limit 1;
  select id into v_squad from public.teams where kind = 'age_squad' and age_band = 'U8';
  select id into v_match_team from public.teams
  where kind = 'competition_team' and age_band = 'U8' and 'U8' = any (eligible_birth_ages)
  order by name limit 1;
  if v_squad is null or v_match_team is null or v_birth is null then
    raise exception 'fixture: seeded 梯隊 U8 and a U8 隊伍 are required';
  end if;
  update public.teams set status = 'active' where id in (v_squad, v_match_team);

  insert into public.players (birth_date, name_en_given, name_en_family, name_zh, continues_training)
  values (v_birth, 'Rules', 'Verify', '規則', true) returning id into v_player;
  insert into public.guardian_player_links (guardian_user_id, player_id, status, reviewed_by, reviewed_at)
  values (v_parent, v_player, 'approved', v_admin, now());

  perform pg_temp.as_user(v_admin);
  perform public.admin_set_player_age_squad(v_player, v_squad, 93);
  perform public.admin_set_player_competition_teams(v_player, array[v_match_team], array[93]);

  select id into v_pkg10 from public.session_packages where age_band = 'U8' and credits = 10 and active;
  select id into v_pkg30 from public.session_packages where age_band = 'U8' and credits = 30 and active;
  perform pg_temp.as_user(v_parent);
  v_claim := public.submit_payment_claim(v_player, v_pkg10, '60601');
  perform pg_temp.as_user(v_admin);
  perform public.admin_review_payment_claim(v_claim, 'approved', null);
  if pg_temp.balance(v_player) <> 10 then
    raise exception 'fixture: expected 10 credits, got %', pg_temp.balance(v_player);
  end if;

  -- P06-1a Match 30 hours away: a normal cancel, no debit later.
  perform pg_temp.as_user(v_admin);
  v_s := pg_temp.new_session(v_match_team, 'cup', now() + interval '30 hours', 'Cup far');
  perform pg_temp.as_user(v_parent);
  v_reg := public.register_player_for_session(v_s, v_player, null);
  perform public.cancel_session_registration(v_reg);
  select status into v_status from public.session_registrations where id = v_reg;
  if v_status <> 'cancelled' then
    raise exception 'P06-1 failed: cancel 30h before is %', v_status;
  end if;
  update public.training_sessions
  set starts_at = pg_temp.at_club(5, 9), ends_at = pg_temp.at_club(5, 11)
  where id = v_s;
  perform pg_temp.as_user(v_admin);
  perform public.finalize_session_attendance(v_s);
  if exists (select 1 from public.session_attendance where session_id = v_s and player_id = v_player) then
    raise exception 'P06-1 failed: a timely cancel was marked as a no-show';
  end if;

  -- P06-1b Match 10 hours away: late_cancelled; finalize debits 1.
  v_s := pg_temp.new_session(v_match_team, 'cup', now() + interval '10 hours', 'Cup near');
  perform pg_temp.as_user(v_parent);
  v_reg := public.register_player_for_session(v_s, v_player, null);
  perform public.cancel_session_registration(v_reg);
  select status into v_status from public.session_registrations where id = v_reg;
  if v_status <> 'late_cancelled' then
    raise exception 'P06-1 failed: cancel 10h before is %', v_status;
  end if;
  if (select cancelled_at from public.session_registrations where id = v_reg) is null then
    raise exception 'P06-1 failed: cancelled_at not recorded';
  end if;
  update public.training_sessions
  set starts_at = pg_temp.at_club(6, 9), ends_at = pg_temp.at_club(6, 11)
  where id = v_s;
  v_before := pg_temp.balance(v_player);
  perform pg_temp.as_user(v_admin);
  if public.finalize_session_attendance(v_s) <> 1 then
    raise exception 'P06-1 failed: finalize did not mark the late cancel';
  end if;
  select * into v_att from public.session_attendance where session_id = v_s and player_id = v_player;
  if v_att.status <> 'unexcused_absent' or v_att.credits_debited <> 1 or v_before - pg_temp.balance(v_player) <> 1 then
    raise exception 'P06-1 failed: late cancel recorded % / -%', v_att.status, v_att.credits_debited;
  end if;

  -- C06-a An admin cancel inside 24 hours is a plain cancel.
  v_s := pg_temp.new_session(v_match_team, 'league', now() + interval '5 hours', 'League admin cancel');
  perform pg_temp.as_user(v_parent);
  v_reg := public.register_player_for_session(v_s, v_player, null);
  perform pg_temp.as_user(v_admin);
  perform public.cancel_session_registration(v_reg);
  if (select status from public.session_registrations where id = v_reg) <> 'cancelled' then
    raise exception 'C06-a failed: admin cancel became late_cancelled';
  end if;

  -- P06-2 Special session, late cancel + illness leave; finalize debits 2,
  -- approval reverses at the original unit cost; task opens and closes.
  v_s := pg_temp.new_session(v_squad, 'special', now() + interval '3 hours', 'Special visit');
  perform pg_temp.as_user(v_parent);
  v_reg := public.register_player_for_session(v_s, v_player, null);
  perform public.cancel_session_registration(v_reg);
  v_leave := public.request_excused_leave(v_reg, 'fever', 'illness');
  if (select reason_category from public.session_leave_requests where id = v_leave) <> 'illness' then
    raise exception 'P06-2 failed: leave reason not stored';
  end if;
  select * into v_task from public.tasks where dedupe_key = 'leave_request:' || v_leave;
  if v_task.status is distinct from 'open' or v_task.assignee_role <> 'staff' then
    raise exception 'P06-2 failed: no open staff task for the leave request';
  end if;
  update public.training_sessions
  set starts_at = pg_temp.at_club(7, 9), ends_at = pg_temp.at_club(7, 11)
  where id = v_s;
  v_before := pg_temp.balance(v_player);
  perform pg_temp.as_user(v_admin);
  perform public.finalize_session_attendance(v_s);
  if v_before - pg_temp.balance(v_player) <> 2 then
    raise exception 'P06-2 failed: special late cancel debited %', v_before - pg_temp.balance(v_player);
  end if;
  perform public.staff_review_leave_request(v_leave, 'approved', null);
  select * into v_att from public.session_attendance where session_id = v_s and player_id = v_player;
  if v_att.status <> 'excused_absent' or v_att.credits_debited <> 0 or pg_temp.balance(v_player) <> v_before then
    raise exception 'P06-2 failed: approval did not reverse (status %, balance %)', v_att.status, pg_temp.balance(v_player);
  end if;
  select unit_cost_twd into v_unit from public.session_credit_ledger
  where attendance_id = v_att.id and entry_type = 'reversal';
  if v_unit <> 350 then
    raise exception 'P06-2 failed: reversal unit cost %', v_unit;
  end if;
  if (select status from public.tasks where dedupe_key = 'leave_request:' || v_leave) <> 'done' then
    raise exception 'P06-2 failed: leave task not closed';
  end if;
  if not exists (select 1 from public.audit_log where action = 'leave_request.approved' and entity_id = v_leave and actor_id = v_admin) then
    raise exception 'P06-2 failed: leave approval not audited';
  end if;

  -- P06-3 Two matches on one day, both attended: one credit.
  v_s := pg_temp.new_session(v_match_team, 'cup', pg_temp.at_club(3, 9), 'Cup morning');
  v_s2 := pg_temp.new_session(v_match_team, 'cup', pg_temp.at_club(3, 14), 'Cup afternoon');
  v_before := pg_temp.balance(v_player);
  perform public.mark_session_attendance(v_s, v_player, 'present');
  perform public.mark_session_attendance(v_s2, v_player, 'present');
  if v_before - pg_temp.balance(v_player) <> 1 then
    raise exception 'P06-3 failed: two matches one day debited %', v_before - pg_temp.balance(v_player);
  end if;

  -- P06-4 Regular: attend without signing up → −1; signed up, did not come → 0.
  v_s := pg_temp.new_session(v_squad, 'regular', pg_temp.at_club(2, 9), 'Training walk-in');
  v_before := pg_temp.balance(v_player);
  perform public.mark_session_attendance(v_s, v_player, 'present');
  if v_before - pg_temp.balance(v_player) <> 1 then
    raise exception 'P06-4 failed: walk-in debited %', v_before - pg_temp.balance(v_player);
  end if;
  v_s := pg_temp.new_session(v_squad, 'regular', pg_temp.at_club(2, 14), 'Training no-show');
  perform pg_temp.as_user(v_parent);
  perform public.register_player_for_session(v_s, v_player, null);
  perform pg_temp.as_user(v_admin);
  v_before := pg_temp.balance(v_player);
  if public.finalize_session_attendance(v_s) <> 0 or pg_temp.balance(v_player) <> v_before then
    raise exception 'P06-4 failed: regular no-show was debited';
  end if;

  -- P06-5 Balance 0, attends → −1, renewal task for staff.
  perform public.admin_adjust_session_credits(v_player, -pg_temp.balance(v_player), 'verify reset');
  if pg_temp.balance(v_player) <> 0 then
    raise exception 'fixture: balance not reset';
  end if;
  v_s := pg_temp.new_session(v_squad, 'regular', pg_temp.at_club(1, 9), 'Training owed 1');
  perform public.mark_session_attendance(v_s, v_player, 'present');
  if pg_temp.balance(v_player) <> -1 then
    raise exception 'P06-5 failed: balance %', pg_temp.balance(v_player);
  end if;
  select * into v_task from public.tasks where dedupe_key = 'credits_renew:' || v_player;
  if v_task.status is distinct from 'open' or v_task.assignee_role <> 'staff' then
    raise exception 'P06-5 failed: no renewal task';
  end if;
  if (select unit_cost_twd from public.session_credit_ledger
      where session_id = v_s and player_id = v_player and amount < 0) <> 350 then
    raise exception 'P06-5 failed: owed debit did not carry the average unit cost';
  end if;

  -- P06-6 At −3 sign-ups are refused; attendance still records (−4); the
  -- director gets a task.
  v_s := pg_temp.new_session(v_squad, 'regular', pg_temp.at_club(1, 11), 'Training owed 2');
  perform public.mark_session_attendance(v_s, v_player, 'present');
  v_s := pg_temp.new_session(v_squad, 'regular', pg_temp.at_club(1, 13), 'Training owed 3');
  perform public.mark_session_attendance(v_s, v_player, 'present');
  if pg_temp.balance(v_player) <> -3 then
    raise exception 'P06-6 failed: balance %', pg_temp.balance(v_player);
  end if;
  select * into v_task from public.tasks where dedupe_key = 'credits_limit:' || v_player;
  if v_task.status is distinct from 'open' or v_task.assignee_role <> 'director' then
    raise exception 'P06-6 failed: no limit task for the director';
  end if;
  v_s := pg_temp.new_session(v_squad, 'regular', now() + interval '3 days', 'Training blocked');
  perform pg_temp.as_user(v_parent);
  v_failed := false;
  begin
    perform public.register_player_for_session(v_s, v_player, null);
  exception when others then
    v_failed := sqlerrm = 'credit_limit_reached';
  end;
  if not v_failed then
    raise exception 'P06-6 failed: registration at −3 was accepted';
  end if;
  perform pg_temp.as_user(v_admin);
  v_s := pg_temp.new_session(v_squad, 'regular', pg_temp.at_club(1, 15), 'Training owed 4');
  perform public.mark_session_attendance(v_s, v_player, 'present');
  if pg_temp.balance(v_player) <> -4 then
    raise exception 'P06-6 failed: attendance at the limit not recorded (balance %)', pg_temp.balance(v_player);
  end if;

  -- C06-b Buying on a negative balance: average = the new package price; both
  -- tasks close once the balance is positive.
  perform pg_temp.as_user(v_parent);
  v_claim := public.submit_payment_claim(v_player, v_pkg30, '60602');
  perform pg_temp.as_user(v_admin);
  perform public.admin_review_payment_claim(v_claim, 'approved', null);
  if pg_temp.balance(v_player) <> 26 then
    raise exception 'C06-b failed: balance after purchase %', pg_temp.balance(v_player);
  end if;
  if (select round(avg_unit_cost_twd, 2) from public.player_session_balances where player_id = v_player) <> 333.33 then
    raise exception 'C06-b failed: average after a negative balance is %',
      (select avg_unit_cost_twd from public.player_session_balances where player_id = v_player);
  end if;
  if exists (select 1 from public.tasks
             where dedupe_key in ('credits_renew:' || v_player, 'credits_limit:' || v_player)
               and status = 'open') then
    raise exception 'C06-b failed: balance tasks still open after purchase';
  end if;

  -- C06-c Parents cannot write registrations directly (RLS); the RPC is the path.
  v_s := pg_temp.new_session(v_squad, 'special', now() + interval '2 hours', 'Special direct');
  perform pg_temp.as_user(v_parent);
  v_reg := public.register_player_for_session(v_s, v_player, null);
  execute 'set local role authenticated';
  update public.session_registrations set status = 'cancelled' where id = v_reg;
  get diagnostics v_rows = row_count;
  v_failed := false;
  begin
    insert into public.session_registrations (session_id, player_id, guardian_user_id, status)
    values (v_s, v_player, v_parent, 'registered');
  exception when insufficient_privilege then
    v_failed := true;
  end;
  reset role;
  if v_rows <> 0 or (select status from public.session_registrations where id = v_reg) <> 'registered' then
    raise exception 'C06-c failed: parent bypassed the late-cancel rule with a table update';
  end if;
  if not v_failed then
    raise exception 'C06-c failed: parent inserted a registration directly';
  end if;

  -- C06-d The 24-hour job finalizes sessions nobody closed; only the job can call it.
  perform pg_temp.as_user(v_admin);
  update public.training_sessions
  set starts_at = now() - interval '30 hours', ends_at = now() - interval '28 hours'
  where id = v_s;
  perform public.finalize_due_sessions();
  if (select attendance_finalized_at from public.training_sessions where id = v_s) is null
     or not exists (select 1 from public.session_attendance
                    where session_id = v_s and player_id = v_player and status = 'unexcused_absent') then
    raise exception 'C06-d failed: overdue special session not finalized';
  end if;
  if has_function_privilege('authenticated', 'public.finalize_due_sessions()', 'execute')
     or has_function_privilege('authenticated', 'public.apply_session_attendance(uuid, uuid, public.attendance_status, uuid, text)', 'execute') then
    raise exception 'C06-d failed: internal attendance functions callable by signed-in users';
  end if;
  perform pg_temp.as_user(v_parent);
  v_failed := false;
  begin
    perform public.finalize_session_attendance(v_s);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'C06-d failed: parent finalized a session';
  end if;

  raise notice 'registration_rules_verification: all checks passed';
end;
$$;

rollback;
