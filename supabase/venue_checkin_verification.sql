-- Phase 1 PR-07 verification: venue QR check-in, head count, removal,
-- backfill notices. Self-contained; rolls back. Staging SQL Editor or CI
-- (scripts/db-verify.sh). Do not run against production. Synthetic names only.

begin;

create function pg_temp.as_user(p_uid uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true);
$$;

create function pg_temp.balance(p_player uuid)
returns integer
language sql
as $$
  select coalesce((select credits_available from public.player_session_balances where player_id = p_player), 0);
$$;

create function pg_temp.result_for(p_results jsonb, p_player uuid)
returns jsonb
language sql
as $$
  select r from jsonb_array_elements(p_results) r where r ->> 'player_id' = p_player::text;
$$;

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_parent uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_squad uuid;
  v_birth date;
  v_kid1 uuid;
  v_kid2 uuid;
  v_kid3 uuid;
  v_venue uuid;
  v_token text;
  v_old_token text;
  v_s uuid;
  v_s2 uuid;
  v_res jsonb;
  v_before integer;
  v_att uuid;
  v_task public.tasks%rowtype;
  v_notice public.parent_notices%rowtype;
  v_count integer;
  v_failed boolean;
begin
  insert into auth.users (id) values (v_admin), (v_parent), (v_stranger);
  perform pg_temp.as_user(v_admin);
  perform public.ensure_own_profile();
  perform pg_temp.as_user(v_parent);
  perform public.ensure_own_profile();
  perform pg_temp.as_user(v_stranger);
  perform public.ensure_own_profile();
  insert into public.user_roles (user_id, role) values (v_admin, 'admin') on conflict do nothing;

  select d::date into v_birth
  from generate_series(public.club_today() - interval '9 years', public.club_today() - interval '5 years', interval '1 month') as g(d)
  where public.age_squad_band_from_birth_date(d::date, public.club_today()) = 'U8'
  limit 1;
  select id into v_squad from public.teams where kind = 'age_squad' and age_band = 'U8';
  update public.teams set status = 'active' where id = v_squad;

  insert into public.players (birth_date, name_en_given, name_en_family, name_zh)
  values (v_birth, 'Qr', 'One', '掃碼一') returning id into v_kid1;
  insert into public.players (birth_date, name_en_given, name_en_family, name_zh)
  values (v_birth, 'Qr', 'Two', '掃碼二') returning id into v_kid2;
  insert into public.players (birth_date, name_en_given, name_en_family, name_zh)
  values (v_birth, 'Qr', 'Three', '掃碼三') returning id into v_kid3;
  insert into public.guardian_player_links (guardian_user_id, player_id, status, reviewed_by, reviewed_at)
  values (v_parent, v_kid1, 'approved', v_admin, now()),
         (v_parent, v_kid2, 'approved', v_admin, now()),
         (v_parent, v_kid3, 'approved', v_admin, now());

  perform pg_temp.as_user(v_admin);
  perform public.admin_set_player_age_squad(v_kid1, v_squad, 71);
  perform public.admin_set_player_age_squad(v_kid2, v_squad, 72);
  perform public.admin_set_player_age_squad(v_kid3, v_squad, 73);
  perform public.admin_adjust_session_credits(v_kid1, 5, 'verify seed');
  perform public.admin_adjust_session_credits(v_kid2, 5, 'verify seed');
  perform public.admin_adjust_session_credits(v_kid3, 5, 'verify seed');

  v_venue := public.admin_upsert_venue(null, 'Verify Field', null, true);
  select checkin_token into v_token from public.venues where id = v_venue;
  if v_token !~ '^[0-9a-f]{32}$' then
    raise exception 'C07-a failed: token format %', v_token;
  end if;

  -- C07-b Parents cannot read venue tokens.
  perform pg_temp.as_user(v_parent);
  execute 'set local role authenticated';
  select count(*) into v_count from public.venues where id = v_venue;
  reset role;
  if v_count <> 0 then
    raise exception 'C07-b failed: parent can read venue tokens';
  end if;

  -- P07-1 31 minutes before: nothing to check in; 29 minutes before: checked in.
  perform pg_temp.as_user(v_admin);
  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind, venue_id)
  values (v_squad, now() + interval '31 minutes', now() + interval '121 minutes', 'QR early', 'regular', v_venue)
  returning id into v_s;
  perform pg_temp.as_user(v_parent);
  v_res := public.parent_checkin(v_token, array[v_kid1], null);
  if pg_temp.result_for(v_res, v_kid1) ->> 'result' <> 'no_session' then
    raise exception 'P07-1 failed: 31 minutes early gave %', v_res;
  end if;
  if jsonb_array_length(public.checkin_preview(v_token) -> 'sessions') <> 0 then
    raise exception 'P07-1 failed: preview lists a session 31 minutes early';
  end if;
  update public.training_sessions
  set starts_at = now() + interval '29 minutes', ends_at = now() + interval '119 minutes'
  where id = v_s;
  v_res := public.parent_checkin(v_token, array[v_kid1], null);
  if pg_temp.result_for(v_res, v_kid1) ->> 'result' <> 'checked_in' then
    raise exception 'P07-1 failed: 29 minutes early gave %', v_res;
  end if;
  if (select source from public.session_attendance where session_id = v_s and player_id = v_kid1) <> 'parent_qr'
     or (select checked_in_at from public.session_attendance where session_id = v_s and player_id = v_kid1) is null then
    raise exception 'P07-1 failed: check-in not recorded as parent_qr';
  end if;

  -- P07-2 Siblings in one scan: two records, one credit each.
  v_before := pg_temp.balance(v_kid2);
  v_res := public.parent_checkin(v_token, array[v_kid2, v_kid3], null);
  if pg_temp.result_for(v_res, v_kid2) ->> 'result' <> 'checked_in'
     or pg_temp.result_for(v_res, v_kid3) ->> 'result' <> 'checked_in'
     or v_before - pg_temp.balance(v_kid2) <> 1
     or (pg_temp.result_for(v_res, v_kid3) ->> 'credits_available')::integer <> 4 then
    raise exception 'P07-2 failed: %', v_res;
  end if;

  -- P07-3 Scanning again does not debit again.
  v_before := pg_temp.balance(v_kid1);
  v_res := public.parent_checkin(v_token, array[v_kid1], null);
  if pg_temp.result_for(v_res, v_kid1) ->> 'result' <> 'already' or pg_temp.balance(v_kid1) <> v_before then
    raise exception 'P07-3 failed: %', v_res;
  end if;

  -- P07-4 Someone who is not the child's approved parent is refused.
  perform pg_temp.as_user(v_stranger);
  v_failed := false;
  begin
    perform public.parent_checkin(v_token, array[v_kid1], null);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'P07-4 failed: stranger checked a child in';
  end if;

  -- P07-5 Staff remove a check-in: row gone, credit back, audited.
  perform pg_temp.as_user(v_admin);
  select id into v_att from public.session_attendance where session_id = v_s and player_id = v_kid3;
  v_before := pg_temp.balance(v_kid3);
  perform public.staff_remove_checkin(v_s, v_kid3, 'checked in, did not come');
  if exists (select 1 from public.session_attendance where id = v_att)
     or pg_temp.balance(v_kid3) <> v_before + 1 then
    raise exception 'P07-5 failed: attendance or credit not reversed';
  end if;
  if not exists (select 1 from public.audit_log where action = 'attendance.checkin_removed' and entity_id = v_att and actor_id = v_admin) then
    raise exception 'P07-5 failed: removal not audited';
  end if;
  if not exists (select 1 from public.session_credit_ledger
                 where session_id = v_s and player_id = v_kid3 and entry_type = 'reversal' and unit_cost_twd = 0)
     or exists (select 1 from public.session_credit_ledger where attendance_id = v_att) then
    raise exception 'P07-5 failed: ledger reversal or attendance link wrong';
  end if;
  -- The ledger stays immutable otherwise.
  v_failed := false;
  begin
    update public.session_credit_ledger set amount = 99 where session_id = v_s and player_id = v_kid3;
  exception when others then
    v_failed := sqlerrm like '%immutable%';
  end;
  if not v_failed then
    raise exception 'P07-5 failed: ledger row edited';
  end if;

  -- P07-6 Head count 3 with 2 present → director task; backfilling the third closes it.
  v_res := public.staff_confirm_headcount(v_s, 3);
  if (v_res ->> 'mismatch')::boolean is not true then
    raise exception 'P07-6 failed: no mismatch reported (%)', v_res;
  end if;
  select * into v_task from public.tasks where dedupe_key = 'headcount:' || v_s;
  if v_task.status is distinct from 'open' or v_task.assignee_role <> 'director' then
    raise exception 'P07-6 failed: no director task';
  end if;
  perform public.mark_session_attendance(v_s, v_kid3, 'present');
  if (select status from public.tasks where dedupe_key = 'headcount:' || v_s) <> 'done' then
    raise exception 'P07-6 failed: task still open after backfill';
  end if;

  -- P07-8 The backfill left a notice for the parents with date, debit and balance.
  select * into v_notice from public.parent_notices where player_id = v_kid3 and session_id = v_s;
  if v_notice.id is null
     or v_notice.kind <> 'attendance.staff_backfill'
     or (v_notice.params ->> 'credits_debited')::integer <> 1
     or (v_notice.params ->> 'credits_available')::integer <> pg_temp.balance(v_kid3)
     or v_notice.params ->> 'session_date' is null then
    raise exception 'P07-8 failed: notice %', v_notice.params;
  end if;
  if (select source from public.session_attendance where session_id = v_s and player_id = v_kid3) <> 'staff' then
    raise exception 'P07-8 failed: backfill source';
  end if;
  -- QR check-ins leave no notice.
  if exists (select 1 from public.parent_notices where player_id = v_kid1) then
    raise exception 'P07-8 failed: QR check-in created a notice';
  end if;
  perform pg_temp.as_user(v_parent);
  execute 'set local role authenticated';
  select count(*) into v_count from public.parent_notices where player_id = v_kid3;
  reset role;
  if v_count <> 1 then
    raise exception 'P07-8 failed: parent cannot read the notice';
  end if;
  perform pg_temp.as_user(v_stranger);
  if public.mark_parent_notices_read(array[v_notice.id]) <> 0 then
    raise exception 'P07-8 failed: stranger marked the notice read';
  end if;
  perform pg_temp.as_user(v_parent);
  if public.mark_parent_notices_read(array[v_notice.id]) <> 1 then
    raise exception 'P07-8 failed: parent could not mark read';
  end if;

  -- C07-c Two sessions open at once → the parent chooses.
  perform pg_temp.as_user(v_admin);
  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind, venue_id)
  values (v_squad, now() - interval '5 minutes', now() + interval '60 minutes', 'QR parallel', 'special', v_venue)
  returning id into v_s2;
  perform pg_temp.as_user(v_parent);
  perform public.parent_checkin(v_token, array[v_kid2], null);
  v_res := public.parent_checkin(v_token, array[v_kid3], null);
  if pg_temp.result_for(v_res, v_kid3) ->> 'result' <> 'choose' then
    raise exception 'C07-c failed: expected a choice, got %', v_res;
  end if;
  v_before := pg_temp.balance(v_kid3);
  v_res := public.parent_checkin(v_token, array[v_kid3], v_s2);
  if pg_temp.result_for(v_res, v_kid3) ->> 'result' <> 'checked_in' or v_before - pg_temp.balance(v_kid3) <> 2 then
    raise exception 'C07-c failed: chosen special session %', v_res;
  end if;

  -- P07-7 A new token kills the old QR at once.
  v_old_token := v_token;
  perform pg_temp.as_user(v_admin);
  perform public.admin_regenerate_venue_token(v_venue);
  select checkin_token into v_token from public.venues where id = v_venue;
  if v_token = v_old_token then
    raise exception 'P07-7 failed: token unchanged';
  end if;
  perform pg_temp.as_user(v_parent);
  if public.checkin_preview(v_old_token) is not null then
    raise exception 'P07-7 failed: old token still previews';
  end if;
  v_failed := false;
  begin
    perform public.parent_checkin(v_old_token, array[v_kid1], null);
  exception when others then
    v_failed := sqlerrm like '%invalid checkin token%';
  end;
  if not v_failed then
    raise exception 'P07-7 failed: old token still checks in';
  end if;
  if public.checkin_preview(v_token) is null then
    raise exception 'P07-7 failed: new token does not work';
  end if;

  -- C07-d A venue session that ended an hour ago with no head count → staff task;
  -- confirming the count closes it.
  perform pg_temp.as_user(v_admin);
  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind, venue_id)
  values (v_squad, now() - interval '3 hours', now() - interval '90 minutes', 'QR uncounted', 'regular', v_venue)
  returning id into v_s;
  perform public.finalize_due_sessions();
  select * into v_task from public.tasks where dedupe_key = 'headcount_missing:' || v_s;
  if v_task.status is distinct from 'open' or v_task.assignee_role <> 'admin' then
    raise exception 'C07-d failed: no missing head count task';
  end if;
  perform public.staff_confirm_headcount(v_s, 0);
  if (select status from public.tasks where dedupe_key = 'headcount_missing:' || v_s) <> 'done' then
    raise exception 'C07-d failed: task not closed by the head count';
  end if;

  -- C07-e Only staff run head counts, removals and venues.
  perform pg_temp.as_user(v_parent);
  v_failed := false;
  begin
    perform public.staff_confirm_headcount(v_s, 1);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'C07-e failed: parent confirmed a head count';
  end if;
  v_failed := false;
  begin
    perform public.admin_regenerate_venue_token(v_venue);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'C07-e failed: parent regenerated a token';
  end if;

  raise notice 'venue_checkin_verification: all checks passed';
end;
$$;

rollback;
