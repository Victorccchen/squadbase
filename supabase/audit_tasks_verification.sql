-- Phase 1 PR-03 verification: audit log and task inbox.
-- Self-contained; rolls back. Staging SQL Editor or CI (scripts/db-verify.sh).
-- Do not run against production. Synthetic names only.

begin;

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_parent uuid := gen_random_uuid();
  v_team uuid;
  v_player uuid;
  v_birth date;
  v_pkg uuid;
  v_claim uuid;
  v_link uuid;
  v_link2 uuid;
  v_task public.tasks%rowtype;
  v_audit public.audit_log%rowtype;
  v_id uuid;
  v_id2 uuid;
  v_failed boolean;
begin
  insert into auth.users (id) values (v_admin), (v_parent);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.ensure_own_profile();
  perform set_config('request.jwt.claim.sub', v_parent::text, true);
  perform public.ensure_own_profile();
  insert into public.user_roles (user_id, role) values (v_admin, 'admin') on conflict do nothing;

  select d::date into v_birth
  from generate_series(public.club_today() - interval '9 years', public.club_today() - interval '5 years', interval '1 month') as g(d)
  where public.age_squad_band_from_birth_date(d::date, public.club_today()) = 'U8'
  limit 1;
  select id into v_team from public.teams where kind = 'age_squad' and age_band = 'U8';
  update public.teams set status = 'active' where id = v_team;
  insert into public.players (birth_date, name_en_given, name_en_family, name_zh)
  values (v_birth, 'Audit', 'Verify', '稽核') returning id into v_player;
  insert into public.team_memberships (player_id, team_id, jersey_number) values (v_player, v_team, 61);
  select id into v_pkg from public.session_packages where age_band = 'U8' and active order by credits limit 1;

  -- Binding request created by the parent through the table (RLS path).
  perform set_config('request.jwt.claim.sub', v_parent::text, true);
  execute 'set local role authenticated';
  insert into public.guardian_player_links (guardian_user_id, player_id) values (v_parent, v_player)
  returning id into v_link;
  reset role;

  -- T03-a A pending binding request opens a task.
  select * into v_task from public.tasks where dedupe_key = 'guardian_link:' || v_link;
  if v_task.id is null or v_task.status <> 'open' or v_task.kind <> 'guardian_link.pending' then
    raise exception 'T03-a failed: no open task for the pending binding request';
  end if;

  -- T03-b Parent withdraws (table update as the parent) → task dismissed.
  perform set_config('request.jwt.claim.sub', v_parent::text, true);
  execute 'set local role authenticated';
  update public.guardian_player_links set status = 'revoked' where id = v_link;
  reset role;
  select * into v_task from public.tasks where dedupe_key = 'guardian_link:' || v_link;
  if v_task.status <> 'dismissed' or v_task.done_by is distinct from v_parent then
    raise exception 'T03-b failed: withdrawn request task is % (by %)', v_task.status, v_task.done_by;
  end if;

  -- T03-c A new request, approved by admin → task done.
  perform set_config('request.jwt.claim.sub', v_parent::text, true);
  execute 'set local role authenticated';
  insert into public.guardian_player_links (guardian_user_id, player_id) values (v_parent, v_player)
  returning id into v_link2;
  reset role;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.admin_review_guardian_link(v_link2, 'approved');
  select * into v_task from public.tasks where dedupe_key = 'guardian_link:' || v_link2;
  if v_task.status <> 'done' or v_task.done_by is distinct from v_admin then
    raise exception 'T03-c failed: approved request task is %', v_task.status;
  end if;

  -- P03-2 Payment claim: submit opens a task, approval closes it.
  perform set_config('request.jwt.claim.sub', v_parent::text, true);
  v_claim := public.submit_payment_claim(v_player, v_pkg, '13579');
  select * into v_task from public.tasks where dedupe_key = 'payment_claim:' || v_claim;
  if v_task.status is distinct from 'open' or v_task.kind <> 'payment_claim.pending' then
    raise exception 'P03-2 failed: no open task after submit';
  end if;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.admin_review_payment_claim(v_claim, 'approved', null);
  select * into v_task from public.tasks where dedupe_key = 'payment_claim:' || v_claim;
  if v_task.status <> 'done' or v_task.done_by is distinct from v_admin then
    raise exception 'P03-2 failed: task after approval is %', v_task.status;
  end if;

  -- P03-1 Approval wrote an audit row with before/after and the actor.
  select * into v_audit from public.audit_log
  where entity_type = 'payment_claim' and entity_id = v_claim and action = 'payment_claim.update'
  order by id desc limit 1;
  if v_audit.id is null
     or v_audit.actor_id is distinct from v_admin
     or v_audit.before ->> 'status' <> 'pending'
     or v_audit.after ->> 'status' <> 'approved' then
    raise exception 'P03-1 failed: approval audit row missing or wrong';
  end if;
  if not exists (
    select 1 from public.audit_log
    where entity_type = 'payment_claim' and entity_id = v_claim and action = 'payment_claim.insert'
      and actor_id = v_parent
  ) then
    raise exception 'P03-1 failed: submit was not audited with the parent as actor';
  end if;

  -- T03-d audit_log is append-only; only processed_at may be set.
  v_failed := false;
  begin
    update public.audit_log set action = 'tampered' where id = v_audit.id;
  exception when others then
    v_failed := sqlerrm like '%append-only%';
  end;
  if not v_failed then
    raise exception 'T03-d failed: audit row was edited';
  end if;
  v_failed := false;
  begin
    delete from public.audit_log where id = v_audit.id;
  exception when others then
    v_failed := sqlerrm like '%append-only%';
  end;
  if not v_failed then
    raise exception 'T03-d failed: audit row was deleted';
  end if;
  update public.audit_log set processed_at = now() where id = v_audit.id;

  -- T03-e open_task is idempotent per open dedupe key; reopen after close.
  v_id := public.open_task('test.kind', 'player', v_player, 'test:' || v_player);
  v_id2 := public.open_task('test.kind', 'player', v_player, 'test:' || v_player);
  if v_id is distinct from v_id2 then
    raise exception 'T03-e failed: second open_task created a duplicate';
  end if;
  perform public.close_task_by_key('test:' || v_player);
  v_id2 := public.open_task('test.kind', 'player', v_player, 'test:' || v_player);
  if v_id2 = v_id then
    raise exception 'T03-e failed: closed task was not replaced by a new one';
  end if;

  -- T03-f admin_set_task_status: snooze needs a future time; done is audited.
  v_failed := false;
  begin
    perform public.admin_set_task_status(v_id2, 'snoozed', now() - interval '1 minute');
  exception when others then
    v_failed := sqlerrm like '%future time%';
  end;
  if not v_failed then
    raise exception 'T03-f failed: snooze into the past was accepted';
  end if;
  perform public.admin_set_task_status(v_id2, 'snoozed', now() + interval '1 day');
  perform public.admin_set_task_status(v_id2, 'done');
  if not exists (select 1 from public.audit_log where entity_id = v_id2 and action = 'task.done' and actor_id = v_admin) then
    raise exception 'T03-f failed: task status change not audited';
  end if;

  -- T03-g Non-admins cannot change tasks or log events.
  perform set_config('request.jwt.claim.sub', v_parent::text, true);
  v_failed := false;
  begin
    perform public.admin_set_task_status(v_id2, 'open');
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'T03-g failed: parent changed a task';
  end if;
  v_failed := false;
  begin
    perform public.admin_log_event('photo_pack.export', 'team', null, '{}'::jsonb);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'T03-g failed: parent wrote an audit event';
  end if;
  if has_function_privilege('authenticated', 'public.write_audit(text, text, uuid, jsonb, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.open_task(text, text, uuid, text, text, timestamptz, jsonb)', 'execute') then
    raise exception 'T03-g failed: internal helpers are callable by signed-in users';
  end if;

  -- admin_log_event works for admins.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.admin_log_event('photo_pack.export', 'team', v_team, jsonb_build_object('players', 12));
  if not exists (select 1 from public.audit_log where action = 'photo_pack.export' and entity_id = v_team) then
    raise exception 'T03-h failed: admin event not logged';
  end if;

  raise notice 'audit_tasks_verification: all checks passed';
end;
$$;

rollback;
