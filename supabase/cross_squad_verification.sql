-- Phase 1 PR-05 verification: primary 梯隊 + one cross 梯隊 (跨上).
-- Self-contained; rolls back. Staging SQL Editor or CI (scripts/db-verify.sh).
-- Do not run against production. Synthetic names only.

begin;

create function pg_temp.parent_can_read_session(p_parent uuid, p_session uuid)
returns boolean
language plpgsql
as $$
declare
  v_ok boolean;
begin
  perform set_config('request.jwt.claim.sub', p_parent::text, true);
  execute 'set local role authenticated';
  select exists (select 1 from public.training_sessions where id = p_session) into v_ok;
  reset role;
  return v_ok;
end;
$$;

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_parent uuid := gen_random_uuid();
  v_u8 uuid;
  v_u10 uuid;
  v_u12 uuid;
  v_player uuid;
  v_birth date;
  v_pkg_u8 uuid;
  v_pkg_u10 uuid;
  v_claim uuid;
  v_past uuid;
  v_future uuid;
  v_before integer;
  v_after integer;
  v_row public.team_memberships%rowtype;
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
  select id into v_u8 from public.teams where kind = 'age_squad' and age_band = 'U8';
  select id into v_u10 from public.teams where kind = 'age_squad' and age_band = 'U10';
  select id into v_u12 from public.teams where kind = 'age_squad' and age_band = 'U12';
  if v_u8 is null or v_u10 is null or v_u12 is null then
    raise exception 'fixture: seeded 梯隊 U8, U10 and U12 are required';
  end if;
  update public.teams set status = 'active' where id in (v_u8, v_u10, v_u12);

  insert into public.players (birth_date, name_en_given, name_en_family, name_zh)
  values (v_birth, 'Cross', 'Verify', '跨上') returning id into v_player;
  insert into public.guardian_player_links (guardian_user_id, player_id, status, reviewed_by, reviewed_at)
  values (v_parent, v_player, 'approved', v_admin, now());

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.admin_set_player_age_squad(v_player, v_u8, 97);

  -- C05-a Cross without a primary, or on the primary team, is rejected.
  v_failed := false;
  begin
    perform public.admin_set_cross_squad(v_player, v_u8);
  exception when others then
    v_failed := sqlerrm like '%must differ from primary%';
  end;
  if not v_failed then
    raise exception 'C05-a failed: cross on the primary team accepted';
  end if;

  -- P05-1 U8 primary + U10 cross succeeds; jersey defaults to the primary jersey.
  perform public.admin_set_cross_squad(v_player, v_u10);
  select * into v_row from public.team_memberships where player_id = v_player and team_id = v_u10;
  if v_row.status <> 'active' or v_row.squad_role <> 'cross' or v_row.jersey_number <> 97 then
    raise exception 'P05-1 failed: cross row is % / % / #%', v_row.status, v_row.squad_role, v_row.jersey_number;
  end if;
  if not exists (
    select 1 from public.audit_log
    where action = 'team_membership.cross_set' and entity_id = v_player and actor_id = v_admin
  ) then
    raise exception 'P05-1 failed: cross change not audited';
  end if;

  -- P05-1 A second active cross is rejected by the table rules.
  v_failed := false;
  begin
    insert into public.team_memberships (player_id, team_id, jersey_number, squad_role)
    values (v_player, v_u12, 97, 'cross');
  exception when others then
    v_failed := sqlerrm like '%already has an active cross squad%';
  end;
  if not v_failed then
    raise exception 'P05-1 failed: second cross 梯隊 accepted';
  end if;

  -- C05-b Re-saving the primary 梯隊 keeps the cross 梯隊.
  perform public.admin_set_player_age_squad(v_player, v_u8, 96);
  if not exists (
    select 1 from public.team_memberships
    where player_id = v_player and team_id = v_u10 and status = 'active' and squad_role = 'cross'
  ) then
    raise exception 'C05-b failed: saving the primary dropped the cross 梯隊';
  end if;

  -- C05-c Only admins set cross squads.
  perform set_config('request.jwt.claim.sub', v_parent::text, true);
  v_failed := false;
  begin
    perform public.admin_set_cross_squad(v_player, null);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'C05-c failed: parent changed the cross 梯隊';
  end if;

  -- P05-3 Price follows the primary 梯隊: U8 package accepted, U10–U18 rejected.
  if public.player_team_catalog_band(v_player) is distinct from 'U8' then
    raise exception 'P05-3 failed: catalog band is %', public.player_team_catalog_band(v_player);
  end if;
  select id into v_pkg_u8 from public.session_packages where age_band = 'U8' and active order by credits desc limit 1;
  select id into v_pkg_u10 from public.session_packages where age_band = 'U10_U18' and active order by credits desc limit 1;
  v_failed := false;
  begin
    perform public.submit_payment_claim(v_player, v_pkg_u10, '11223');
  exception when others then
    v_failed := sqlerrm like '%package band mismatch%';
  end;
  if not v_failed then
    raise exception 'P05-3 failed: U10–U18 package accepted for a U8 primary player';
  end if;
  v_claim := public.submit_payment_claim(v_player, v_pkg_u8, '11224');
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.admin_review_payment_claim(v_claim, 'approved', null);

  -- P05-2 The parent can see, register for and attend a U10 session; the debit
  -- follows the U10 regular rule (−1).
  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind)
  values (v_u10, now() - interval '2 hours', now() - interval '1 hour', 'Cross past', 'regular')
  returning id into v_past;
  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind)
  values (v_u10, now() + interval '2 days', now() + interval '2 days 1 hour', 'Cross future', 'regular')
  returning id into v_future;

  if not pg_temp.parent_can_read_session(v_parent, v_future) then
    raise exception 'P05-2 failed: parent cannot see the cross 梯隊 session';
  end if;
  perform set_config('request.jwt.claim.sub', v_parent::text, true);
  perform public.register_player_for_session(v_past, v_player, null);

  select credits_available into v_before from public.player_session_balances where player_id = v_player;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.mark_session_attendance(v_past, v_player, 'present');
  select credits_available into v_after from public.player_session_balances where player_id = v_player;
  if v_before - v_after <> 1 then
    raise exception 'P05-2 failed: cross session debited % (expected 1)', v_before - v_after;
  end if;

  -- P05-4 Clearing the cross hides future U10 sessions; attendance stays and the
  -- attended session is still readable.
  perform public.admin_set_cross_squad(v_player, null);
  if exists (
    select 1 from public.team_memberships
    where player_id = v_player and team_id = v_u10 and status = 'active'
  ) then
    raise exception 'P05-4 failed: cross membership still active';
  end if;
  if pg_temp.parent_can_read_session(v_parent, v_future) then
    raise exception 'P05-4 failed: parent still sees future cross sessions';
  end if;
  if not pg_temp.parent_can_read_session(v_parent, v_past) then
    raise exception 'P05-4 failed: parent lost the attended session';
  end if;
  if not exists (
    select 1 from public.session_attendance where session_id = v_past and player_id = v_player and status = 'present'
  ) then
    raise exception 'P05-4 failed: attendance row missing';
  end if;
  if not exists (
    select 1 from public.audit_log
    where action = 'team_membership.cross_clear' and entity_id = v_player
  ) then
    raise exception 'P05-4 failed: cross removal not audited';
  end if;

  -- C05-d Another cross can be set again later (row reused, no duplicate).
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.admin_set_cross_squad(v_player, v_u12, 41);
  perform public.admin_set_cross_squad(v_player, v_u10);
  if (select count(*) from public.team_memberships
      where player_id = v_player and squad_role = 'cross' and status = 'active') <> 1 then
    raise exception 'C05-d failed: switching cross squads left more than one active';
  end if;

  raise notice 'cross_squad_verification: all checks passed';
end;
$$;

rollback;
