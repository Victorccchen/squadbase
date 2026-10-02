-- RLS permission matrix (Phase 1 PR-02).
-- Builds one player with every kind of relationship, then checks how many of
-- that player's rows each identity can see. "denied" (no table grant) counts
-- as 0. Self-contained; rolls back. CI runs it on every PR.
--
-- When a policy changes on purpose (for example PR-04 removes the coach read
-- on player_session_balances), update the expected row below in the same PR.

begin;

create function pg_temp.visible_rows(p_role text, p_uid uuid, p_table text, p_column text, p_id uuid)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('request.jwt.claim.role', p_role, true);
  execute format('set local role %I', p_role);
  begin
    execute format('select count(*) from public.%I where %I = $1', p_table, p_column)
      into v_count using p_id;
  exception
    when insufficient_privilege then
      v_count := 0;
  end;
  reset role;
  return v_count;
end;
$$;

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_parent_ok uuid := gen_random_uuid();
  v_parent_pending uuid := gen_random_uuid();
  v_parent_none uuid := gen_random_uuid();
  v_coach_on uuid := gen_random_uuid();
  v_coach_off uuid := gen_random_uuid();
  v_team uuid;
  v_other_team uuid;
  v_player uuid;
  v_session uuid;
  v_coach_id uuid;
  v_birth date;
  v_pkg uuid;
  v_claim uuid;
  v_identity record;
  v_check record;
  v_got integer;
  v_failures text := '';
begin
  insert into auth.users (id) values
    (v_admin), (v_parent_ok), (v_parent_pending), (v_parent_none), (v_coach_on), (v_coach_off);
  for v_identity in
    select unnest(array[v_admin, v_parent_ok, v_parent_pending, v_parent_none, v_coach_on, v_coach_off]) as id
  loop
    perform set_config('request.jwt.claim.sub', v_identity.id::text, true);
    perform public.ensure_own_profile();
  end loop;
  insert into public.user_roles (user_id, role) values
    (v_admin, 'admin'), (v_coach_on, 'coach'), (v_coach_off, 'coach')
  on conflict do nothing;

  select d into v_birth
  from generate_series(public.club_today() - interval '9 years', public.club_today() - interval '5 years', interval '1 month') as g(d)
  where public.age_squad_band_from_birth_date(d::date, public.club_today()) = 'U8'
  limit 1;

  select id into v_team from public.teams where kind = 'age_squad' and age_band = 'U8';
  if v_team is null then
    insert into public.teams (name, age_band, kind) values ('RLS U8', 'U8', 'age_squad') returning id into v_team;
  end if;
  select id into v_other_team from public.teams where kind = 'age_squad' and age_band = 'U10';
  if v_other_team is null then
    insert into public.teams (name, age_band, kind) values ('RLS U10', 'U10', 'age_squad') returning id into v_other_team;
  end if;
  update public.teams set status = 'active' where id in (v_team, v_other_team);

  insert into public.players (birth_date, name_en_given, name_en_family, name_zh)
  values (v_birth, 'Rls', 'Matrix', '矩陣') returning id into v_player;
  insert into public.team_memberships (player_id, team_id, jersey_number) values (v_player, v_team, 88);

  insert into public.guardian_player_links (guardian_user_id, player_id, status, reviewed_by, reviewed_at)
  values (v_parent_ok, v_player, 'approved', v_admin, now());
  insert into public.guardian_player_links (guardian_user_id, player_id, status)
  values (v_parent_pending, v_player, 'pending');

  insert into public.coaches (profile_id) values (v_coach_on) returning id into v_coach_id;
  insert into public.coach_team_assignments (coach_id, team_id) values (v_coach_id, v_team);
  insert into public.coaches (profile_id) values (v_coach_off) returning id into v_coach_id;
  insert into public.coach_team_assignments (coach_id, team_id) values (v_coach_id, v_other_team);

  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind)
  values (v_team, now() - interval '2 hours', now() - interval '1 hour', 'RLS session', 'regular')
  returning id into v_session;

  -- Money rows: a claim by the approved parent, approved by admin (balance + ledger).
  select id into v_pkg from public.session_packages where age_band = 'U8' and active order by credits limit 1;
  perform set_config('request.jwt.claim.sub', v_parent_ok::text, true);
  v_claim := public.submit_payment_claim(v_player, v_pkg, '24680');
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.admin_review_payment_claim(v_claim, 'approved', null);
  perform public.mark_session_attendance(v_session, v_player, 'present');

  -- Expected visible rows for this player, per identity.
  --            table                    column       anon pnone ppend pok  con  coff admin
  for v_check in
    select * from (values
      ('players',                 'id',        0, 0, 0, 1, 1, 0, 1),
      ('team_memberships',        'player_id', 0, 0, 0, 1, 1, 0, 1),
      -- PR-04: coaches no longer read families' credit balances.
      ('player_session_balances', 'player_id', 0, 0, 0, 1, 0, 0, 1),
      ('session_credit_ledger',   'player_id', 0, 0, 0, 0, 0, 0, 2),
      ('payment_claims',          'player_id', 0, 0, 0, 1, 0, 0, 1),
      ('session_attendance',      'player_id', 0, 0, 0, 1, 1, 0, 1),
      -- Keyed by the claim id: submit + approval audit rows, and the (closed) task.
      ('audit_log',               'entity_id', 0, 0, 0, 0, 0, 0, 2),
      ('tasks',                   'entity_id', 0, 0, 0, 0, 0, 0, 1)
    ) as t(tbl, col, e_anon, e_none, e_pending, e_ok, e_coach_on, e_coach_off, e_admin)
  loop
    for v_identity in
      select * from (values
        ('anon',          'anon',          null::uuid,         v_check.e_anon),
        ('parent_none',   'authenticated', v_parent_none,      v_check.e_none),
        ('parent_pending','authenticated', v_parent_pending,   v_check.e_pending),
        ('parent_ok',     'authenticated', v_parent_ok,        v_check.e_ok),
        ('coach_on_team', 'authenticated', v_coach_on,         v_check.e_coach_on),
        ('coach_off_team','authenticated', v_coach_off,        v_check.e_coach_off),
        ('admin',         'authenticated', v_admin,            v_check.e_admin)
      ) as i(label, role_name, uid, expected)
    loop
      v_got := pg_temp.visible_rows(v_identity.role_name, v_identity.uid, v_check.tbl, v_check.col,
        case when v_check.tbl in ('audit_log', 'tasks') then v_claim else v_player end);
      if v_got is distinct from v_identity.expected then
        v_failures := v_failures || format(E'\n  %s as %s: saw %s, expected %s',
          v_check.tbl, v_identity.label, v_got, v_identity.expected);
      end if;
    end loop;
  end loop;

  -- RPCs anon must not execute.
  for v_check in
    select unnest(array[
      'public.submit_payment_claim(uuid, uuid, text)',
      'public.admin_review_payment_claim(uuid, public.payment_claim_status, text)',
      'public.admin_adjust_session_credits(uuid, integer, text)',
      'public.mark_session_attendance(uuid, uuid, public.attendance_status)',
      'public.admin_upsert_session_package(uuid, public.package_age_band, integer, integer, boolean)',
      'public.admin_set_task_status(uuid, text, timestamptz)',
      'public.admin_log_event(text, text, uuid, jsonb)',
      'public.set_preferred_language(text, boolean)',
      'public.register_player_for_session(uuid, uuid, text)',
      'public.cancel_session_registration(uuid)',
      'public.request_excused_leave(uuid, text, text)',
      'public.staff_review_leave_request(uuid, public.leave_request_status, text)',
      'public.finalize_session_attendance(uuid)',
      'public.finalize_due_sessions()',
      'public.checkin_preview(text)',
      'public.parent_checkin(text, uuid[], uuid)',
      'public.staff_confirm_headcount(uuid, integer)',
      'public.staff_remove_checkin(uuid, uuid, text)',
      'public.admin_upsert_venue(uuid, text, text, boolean)',
      'public.admin_regenerate_venue_token(uuid)',
      'public.admin_set_session_venue(uuid, uuid, boolean)',
      'public.mark_parent_notices_read(uuid[])',
      'public.submit_payment_report(uuid, uuid, integer, date, text, boolean, text, text, text)',
      'public.admin_upsert_payment_item(uuid, text, text, text, text, integer, boolean, integer)',
      'public.admin_record_invoice(uuid, text)'
    ]) as fn
  loop
    if has_function_privilege('anon', v_check.fn, 'execute') then
      v_failures := v_failures || format(E'\n  anon can execute %s', v_check.fn);
    end if;
  end loop;

  if v_failures <> '' then
    raise exception 'RLS matrix mismatch:%', v_failures;
  end if;
  raise notice 'rls_matrix_verification: all checks passed';
end;
$$;

rollback;
