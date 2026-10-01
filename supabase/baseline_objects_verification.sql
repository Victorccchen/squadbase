-- Baseline check: does this database have what migrations 20260902100000
-- through 20260921030000 created? Read-only.
--
-- Run it in the staging SQL Editor BEFORE `repair-baseline` in the
-- Database (staging) workflow: repair marks those migrations as applied
-- without running them, so anything missing here would stay missing.
-- CI also runs it on a fresh database to keep the list honest.

begin;

do $$
declare
  v_check record;
  v_ok boolean;
  v_missing text := '';
begin
  for v_check in
    select * from (values
      ('20260902100000 profiles, user_roles',
       $q$select to_regclass('public.profiles') is not null and to_regclass('public.user_roles') is not null$q$),
      ('20260902120000 teams, players, coaches',
       $q$select to_regclass('public.teams') is not null and to_regclass('public.coaches') is not null and to_regclass('public.coach_team_assignments') is not null$q$),
      ('20260902140000 players.name_en_given',
       $q$select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'players' and column_name = 'name_en_given')$q$),
      ('20260902160000 guardian_player_links',
       $q$select to_regclass('public.guardian_player_links') is not null$q$),
      ('20260902200000 link_status revoked',
       $q$select exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'link_status' and e.enumlabel = 'revoked')$q$),
      ('20260902220000 admin_revoke_guardian_link',
       $q$select exists (select 1 from pg_proc where proname = 'admin_revoke_guardian_link' and pronamespace = 'public'::regnamespace)$q$),
      ('20260903000000 training_sessions, session_registrations',
       $q$select to_regclass('public.training_sessions') is not null and to_regclass('public.session_registrations') is not null$q$),
      ('20260904000000 session_series, training_sessions.kind',
       $q$select to_regclass('public.session_series') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'training_sessions' and column_name = 'kind')$q$),
      ('20260905000000 session_series.weekdays',
       $q$select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'session_series' and column_name = 'weekdays')$q$),
      ('20260906000000 credits tables',
       $q$select to_regclass('public.session_packages') is not null and to_regclass('public.payment_claims') is not null and to_regclass('public.session_credit_ledger') is not null and to_regclass('public.session_attendance') is not null$q$),
      ('20260907000000 guardian_player_links_open_pair_idx',
       $q$select to_regclass('public.guardian_player_links_open_pair_idx') is not null$q$),
      ('20260907010000 update_session_registration_parent_note',
       $q$select exists (select 1 from pg_proc where proname = 'update_session_registration_parent_note' and pronamespace = 'public'::regnamespace)$q$),
      ('20260907120000 match_publications, match_roster',
       $q$select to_regclass('public.match_publications') is not null and to_regclass('public.match_roster') is not null$q$),
      ('20260908010000 player_assessments',
       $q$select to_regclass('public.player_assessments') is not null$q$),
      ('20260909000000 session_kind friendly',
       $q$select exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'session_kind' and e.enumlabel = 'friendly')$q$),
      ('20260909010000 is_match_session_kind',
       $q$select to_regprocedure('public.is_match_session_kind(public.session_kind)') is not null$q$),
      ('20260910000000 teams.kind, teams.layer_key',
       $q$select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'teams' and column_name = 'layer_key')$q$),
      ('20260911000000 jersey self-update fix',
       $q$select exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and prosrc like '%jersey_number already used on this team%')$q$),
      ('20260912000000 player photos (column + bucket)',
       $q$select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'players' and column_name = 'photo_path') and exists (select 1 from storage.buckets where id = 'player-photos')$q$),
      ('20260918010000 default_eligible_birth_ages',
       $q$select exists (select 1 from pg_proc where proname = 'default_eligible_birth_ages' and pronamespace = 'public'::regnamespace)$q$),
      ('20260919020000 push_subscriptions, notification_sends',
       $q$select to_regclass('public.push_subscriptions') is not null and to_regclass('public.notification_sends') is not null$q$),
      ('20260921010000 assessment_events, assessment_scores',
       $q$select to_regclass('public.assessment_events') is not null and to_regclass('public.assessment_scores') is not null$q$),
      ('20260921030000 admin_soft_delete_match',
       $q$select exists (select 1 from pg_proc where proname = 'admin_soft_delete_match' and pronamespace = 'public'::regnamespace)$q$)
    ) as c(label, probe)
  loop
    execute v_check.probe into v_ok;
    if not coalesce(v_ok, false) then
      v_missing := v_missing || E'\n  ' || v_check.label;
    end if;
  end loop;

  if v_missing <> '' then
    raise exception 'Baseline objects missing (apply these migrations before repair-baseline):%', v_missing;
  end if;
  raise notice 'baseline_objects_verification: all baseline objects present';
end;
$$;

rollback;
