-- Phase 1 PR-04 verification: coach scope and preferred language.
-- Self-contained; rolls back. Staging SQL Editor or CI (scripts/db-verify.sh).
-- Do not run against production. Synthetic names only.
-- Balance visibility per identity is also covered by rls_matrix_verification.sql.

begin;

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_coach uuid := gen_random_uuid();
  v_parent uuid := gen_random_uuid();
  v_team uuid;
  v_player uuid;
  v_session uuid;
  v_coach_id uuid;
  v_birth date;
  v_failed boolean;
  v_lang text;
  v_seen integer;
begin
  insert into auth.users (id) values (v_admin), (v_coach), (v_parent);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.ensure_own_profile();
  perform set_config('request.jwt.claim.sub', v_coach::text, true);
  perform public.ensure_own_profile();
  perform set_config('request.jwt.claim.sub', v_parent::text, true);
  perform public.ensure_own_profile();
  insert into public.user_roles (user_id, role) values (v_admin, 'admin'), (v_coach, 'coach')
  on conflict do nothing;

  select d::date into v_birth
  from generate_series(public.club_today() - interval '9 years', public.club_today() - interval '5 years', interval '1 month') as g(d)
  where public.age_squad_band_from_birth_date(d::date, public.club_today()) = 'U8'
  limit 1;
  select id into v_team from public.teams where kind = 'age_squad' and age_band = 'U8';
  update public.teams set status = 'active' where id = v_team;
  insert into public.players (birth_date, name_en_given, name_en_family, name_zh)
  values (v_birth, 'Coach', 'Scope', '範圍') returning id into v_player;
  insert into public.team_memberships (player_id, team_id, jersey_number) values (v_player, v_team, 62);
  insert into public.coaches (profile_id) values (v_coach) returning id into v_coach_id;
  insert into public.coach_team_assignments (coach_id, team_id) values (v_coach_id, v_team);
  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind)
  values (v_team, now() - interval '2 hours', now() - interval '1 hour', 'Scope session', 'regular')
  returning id into v_session;
  perform public.ensure_player_session_balance(v_player);

  -- P04-1 An assigned coach can no longer mark attendance.
  perform set_config('request.jwt.claim.sub', v_coach::text, true);
  v_failed := false;
  begin
    perform public.mark_session_attendance(v_session, v_player, 'present');
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'P04-1 failed: assigned coach marked attendance';
  end if;

  -- Admin still can (unregistered player marked absent: no debit needed).
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.mark_session_attendance(v_session, v_player, 'unexcused_absent');

  -- P04-2 The assigned coach sees no balance rows; the player row is still visible.
  perform set_config('request.jwt.claim.sub', v_coach::text, true);
  execute 'set local role authenticated';
  select count(*) into v_seen from public.player_session_balances where player_id = v_player;
  if v_seen <> 0 then
    reset role;
    raise exception 'P04-2 failed: coach sees % balance rows', v_seen;
  end if;
  select count(*) into v_seen from public.players where id = v_player;
  reset role;
  if v_seen <> 1 then
    raise exception 'P04-2 failed: coach lost access to the roster player';
  end if;

  -- P04-3 First sign-in sets the language; a later sign-in keeps it; settings change it.
  perform set_config('request.jwt.claim.sub', v_parent::text, true);
  v_lang := public.set_preferred_language('ja', true);
  if v_lang <> 'ja' or (select preferred_language from public.profiles where id = v_parent) <> 'ja' then
    raise exception 'P04-3 failed: first sign-in did not set ja';
  end if;
  v_lang := public.set_preferred_language('en', true);
  if v_lang <> 'ja' or (select preferred_language from public.profiles where id = v_parent) <> 'ja' then
    raise exception 'P04-3 failed: sign-in in another locale overwrote the choice';
  end if;
  perform public.set_preferred_language('zh-Hant');
  if (select preferred_language from public.profiles where id = v_parent) <> 'zh-Hant' then
    raise exception 'P04-3 failed: settings change not saved';
  end if;

  v_failed := false;
  begin
    perform public.set_preferred_language('fr');
  exception when others then
    v_failed := sqlerrm like '%invalid language%';
  end;
  if not v_failed then
    raise exception 'P04-3 failed: unsupported language accepted';
  end if;

  raise notice 'coach_scope_verification: all checks passed';
end;
$$;

rollback;
