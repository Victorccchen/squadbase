-- Official site public API v1 verification (Futuro site spec v4 §5.2, §8.1-2).
-- Does not leave rows. Do not run on production.
-- Paste this file's CONTENTS in the staging SQL Editor (not a path string).
--
-- SITE-1:  site_list_matches returns the whole current season (no 90-day
--          window): tagged matches and untagged matches inside the season
--          dates; a match outside it only with that season's p_season_id.
-- SITE-2:  admin_cancel_match keeps the match published; the site lists it as
--          cancelled, the Squadbase portal (list_published_matches) does not.
-- SITE-3:  admin_postpone_match: postponed, no score allowed, video ids hidden;
--          admin_restore_match returns it to scheduled and still published.
-- SITE-4:  admin_set_match_result records result_entered_at; restore clears it.
-- SITE-5:  site_list_match_roster: senior/reserve only, 18+ on match day, no
--          player_id column.
-- SITE-6:  site_list_clubs returns crest_path only when permission is granted.
-- SITE-7:  anon cannot read the new tables; site_list_venues has no
--          training_venue_id; site_* rows have no embed_check_status.
-- SITE-8:  admin_set_match_broadcast needs URL and id together; non-admins
--          cannot call the new admin RPCs.
-- SITE-9:  site_get_standings returns only the latest round.
-- SITE-10: unpublished or soft-deleted matches are invisible to site_get_match.
-- SITE-11: site_api_version() = 1.

begin;

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_parent uuid := gen_random_uuid();
  v_team uuid;
  v_youth_team uuid;
  v_season uuid;
  v_old_season uuid;
  v_comp uuid;
  v_club_a uuid;
  v_club_b uuid;
  v_venue uuid;
  v_far uuid;
  v_untagged uuid;
  v_old uuid;
  v_cancel uuid;
  v_postpone uuid;
  v_result uuid;
  v_hidden uuid;
  v_deleted uuid;
  v_youth_match uuid;
  v_adult uuid;
  v_minor uuid;
  v_ids uuid[];
  v_status public.match_public_status;
  v_text text;
  v_ts timestamptz;
  v_count integer;
  v_failed boolean;
  v_published boolean;
begin
  insert into auth.users (id) values (v_admin), (v_parent);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.ensure_own_profile();
  perform set_config('request.jwt.claim.sub', v_parent::text, true);
  perform public.ensure_own_profile();
  insert into public.user_roles (user_id, role) values (v_admin, 'admin') on conflict do nothing;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  -- The migration seeds 2026/27 as the current season and the TFPL competition.
  select id into v_season from public.seasons where is_current;
  if v_season is null then
    raise exception 'setup failed: no current season seeded';
  end if;
  select id into v_comp from public.competitions where slug = 'tfpl';
  if v_comp is null then
    raise exception 'setup failed: tfpl competition not seeded';
  end if;
  insert into public.seasons (label, starts_on, ends_on)
  values ('SITE 24/25', date '2024-08-01', date '2025-07-31')
  returning id into v_old_season;

  insert into public.teams (name, age_band, kind, layer_key, eligible_birth_ages)
  values ('SITE senior', 'senior', 'competition_team', 'site-senior', array['senior'])
  returning id into v_team;
  insert into public.teams (name, age_band, kind, layer_key, eligible_birth_ages)
  values ('SITE youth', 'U12', 'competition_team', 'site-u12', array['U12'])
  returning id into v_youth_team;

  insert into public.public_venues (slug, name_zh, training_venue_id)
  values ('site-test-ground', 'SITE 球場', null)
  returning id into v_venue;
  insert into public.clubs (slug, name_zh, abbr, crest_path, crest_permission)
  values ('site-club-a', 'SITE 甲', 'STA', 'crests/a.svg', 'granted')
  returning id into v_club_a;
  insert into public.clubs (slug, name_zh, abbr, crest_path, crest_permission)
  values ('site-club-b', 'SITE 乙', 'STB', 'crests/b.svg', 'unknown')
  returning id into v_club_b;

  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind)
  values (v_team, timestamptz '2027-05-01 15:00+08', timestamptz '2027-05-01 17:30+08', 'SITE far', 'league')
  returning id into v_far;
  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind)
  values (v_team, timestamptz '2026-09-20 15:00+08', timestamptz '2026-09-20 17:30+08', 'SITE untagged', 'friendly')
  returning id into v_untagged;
  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind)
  values (v_team, timestamptz '2025-01-10 15:00+08', timestamptz '2025-01-10 17:30+08', 'SITE old', 'league')
  returning id into v_old;
  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind)
  values (v_team, timestamptz '2026-10-11 15:00+08', timestamptz '2026-10-11 17:30+08', 'SITE cancel', 'league')
  returning id into v_cancel;
  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind)
  values (v_team, timestamptz '2026-10-18 15:00+08', timestamptz '2026-10-18 17:30+08', 'SITE postpone', 'league')
  returning id into v_postpone;
  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind)
  values (v_team, timestamptz '2026-10-25 15:00+08', timestamptz '2026-10-25 17:30+08', 'SITE result', 'cup')
  returning id into v_result;
  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind)
  values (v_team, timestamptz '2026-11-01 15:00+08', timestamptz '2026-11-01 17:30+08', 'SITE hidden', 'league')
  returning id into v_hidden;
  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind, deleted_at)
  values (v_team, timestamptz '2026-11-08 15:00+08', timestamptz '2026-11-08 17:30+08', 'SITE deleted', 'league', now())
  returning id into v_deleted;
  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind)
  values (v_youth_team, timestamptz '2026-11-15 10:00+08', timestamptz '2026-11-15 11:30+08', 'SITE youth', 'league')
  returning id into v_youth_match;

  insert into public.match_publications (
    session_id, opponent, opponent_club_id, side, is_published, public_status, published_at,
    season_id, competition_id, round_no, public_venue_id, live_stream_url, live_video_id
  )
  values
    (v_far, 'SITE 甲', v_club_a, 'home', true, 'scheduled', now(), v_season, v_comp, 20, v_venue, null, null),
    (v_untagged, 'SITE 乙', null, 'away', true, 'scheduled', now(), null, null, null, null, null, null),
    (v_old, 'SITE 甲', null, 'home', true, 'scheduled', now(), null, null, null, null, null, null),
    (v_cancel, 'SITE 甲', null, 'home', true, 'scheduled', now(), v_season, v_comp, 5, null, null, null),
    (v_postpone, 'SITE 乙', null, 'away', true, 'scheduled', now(), v_season, v_comp, 6, null,
      'https://www.youtube.com/watch?v=abcdefghijk', 'abcdefghijk'),
    (v_result, 'SITE 甲', null, 'home', true, 'scheduled', now(), v_season, v_comp, 7, null, null, null),
    (v_hidden, 'SITE 乙', null, 'home', false, 'scheduled', null, v_season, v_comp, 8, null, null, null),
    (v_deleted, 'SITE 乙', null, 'home', true, 'scheduled', now(), v_season, v_comp, 9, null, null, null),
    (v_youth_match, 'SITE 乙', null, 'home', true, 'scheduled', now(), null, null, null, null, null, null);

  insert into public.players (birth_date, name_en_given, name_en_family, name_zh)
  values (date '2000-01-01', 'Adult', 'SITE', 'SITE 成年')
  returning id into v_adult;
  insert into public.players (birth_date, name_en_given, name_en_family, name_zh)
  values (date '2009-06-01', 'Minor', 'SITE', 'SITE 未成年')
  returning id into v_minor;
  insert into public.match_roster (session_id, player_id, jersey_number)
  values (v_far, v_adult, 10), (v_far, v_minor, 11), (v_youth_match, v_minor, 7);

  insert into public.standings (season_id, competition_id, after_round, club_id, rank, played, won, drawn, lost, points)
  values
    (v_season, v_comp, 1, v_club_a, 1, 1, 1, 0, 0, 3),
    (v_season, v_comp, 1, v_club_b, 2, 1, 0, 0, 1, 0),
    (v_season, v_comp, 2, v_club_b, 1, 2, 1, 0, 1, 3),
    (v_season, v_comp, 2, v_club_a, 2, 2, 1, 0, 1, 3);

  -- Admin actions (as the admin JWT).
  perform public.admin_cancel_match(v_cancel);
  perform public.admin_postpone_match(v_postpone);
  perform public.admin_set_match_result(v_result, 2, 1, null);

  -- SITE-4
  select result_entered_at into v_ts from public.match_publications where session_id = v_result;
  if v_ts is null then
    raise exception 'SITE-4 failed: result_entered_at not set';
  end if;

  -- SITE-3: no score while postponed.
  v_failed := false;
  begin
    perform public.admin_set_match_result(v_postpone, 1, 0, null);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'SITE-3 failed: a postponed match accepted a score';
  end if;

  -- SITE-8: URL without id is refused.
  v_failed := false;
  begin
    perform public.admin_set_match_broadcast(
      v_far, 'https://www.youtube.com/watch?v=abcdefghijk', null, null, null, null, null, true, 'unknown', null, null
    );
  exception when invalid_parameter_value then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'SITE-8 failed: broadcast URL without video id was accepted';
  end if;
  perform public.admin_set_match_broadcast(
    v_far, 'https://www.youtube.com/watch?v=abcdefghijk', 'abcdefghijk', null, null, null, null, true, 'ok', 'SITE live', 45
  );
  select embed_checked_at into v_ts from public.match_publications where session_id = v_far;
  if v_ts is null then
    raise exception 'SITE-8 failed: embed_checked_at not set for a checked status';
  end if;

  -- SITE-8: a non-admin cannot postpone, set broadcast or set listing.
  perform set_config('request.jwt.claim.sub', v_parent::text, true);
  execute 'set local role authenticated';
  v_failed := false;
  begin
    perform public.admin_postpone_match(v_far);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'SITE-8 failed: non-admin postponed a match';
  end if;
  v_failed := false;
  begin
    perform public.admin_set_match_listing(v_far, null, null, null, null, null, null);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'SITE-8 failed: non-admin changed match listing';
  end if;
  reset role;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  -- Everything below reads as anon.
  execute 'set local role anon';

  -- SITE-11
  if public.site_api_version() <> 1 then
    raise exception 'SITE-11 failed: site_api_version is %', public.site_api_version();
  end if;

  -- SITE-1
  select array_agg(id) into v_ids from public.site_list_matches() where team_id = v_team;
  if not (v_far = any (v_ids)) then
    raise exception 'SITE-1 failed: a match 7 months ahead is missing from the current season';
  end if;
  if not (v_untagged = any (v_ids)) then
    raise exception 'SITE-1 failed: an untagged match inside the season dates is missing';
  end if;
  if v_old = any (v_ids) then
    raise exception 'SITE-1 failed: a match outside the current season was listed';
  end if;
  select array_agg(id) into v_ids from public.site_list_matches(v_old_season, v_team);
  if v_ids is distinct from array[v_old] then
    raise exception 'SITE-1 failed: 24/25 season listing was %', v_ids;
  end if;
  select count(*) into v_count from public.site_list_matches(null, v_youth_team);
  if v_count <> 1 then
    raise exception 'SITE-1 failed: p_team_id filter returned % rows', v_count;
  end if;

  -- SITE-2
  select public_status into v_status from public.site_get_match(v_cancel);
  if v_status is distinct from 'cancelled' then
    raise exception 'SITE-2 failed: cancelled match on site has status %', v_status;
  end if;
  if exists (select 1 from public.list_published_matches() where id = v_cancel) then
    raise exception 'SITE-2 failed: portal lists a cancelled match';
  end if;

  -- SITE-3: postponed, ids hidden.
  select public_status, live_video_id into v_status, v_text from public.site_get_match(v_postpone);
  if v_status is distinct from 'postponed' then
    raise exception 'SITE-3 failed: postponed match has status %', v_status;
  end if;
  if v_text is not null then
    raise exception 'SITE-3 failed: postponed match exposes live_video_id';
  end if;
  if exists (select 1 from public.list_published_matches() where id = v_postpone) then
    raise exception 'SITE-3 failed: portal lists a postponed match';
  end if;

  -- SITE-4: score visible with its time.
  select result_entered_at into v_ts from public.site_get_match(v_result);
  if v_ts is null then
    raise exception 'SITE-4 failed: site does not return result_entered_at';
  end if;

  -- SITE-5
  select string_agg(name_zh, ',' order by jersey_number) into v_text from public.site_list_match_roster(v_far);
  if v_text is distinct from 'SITE 成年' then
    raise exception 'SITE-5 failed: senior roster was %', v_text;
  end if;
  select count(*) into v_count from public.site_list_match_roster(v_youth_match);
  if v_count <> 0 then
    raise exception 'SITE-5 failed: youth roster returned % rows', v_count;
  end if;
  if exists (
    select 1 from pg_proc
    where oid = 'public.site_list_match_roster(uuid)'::regprocedure
      and 'player_id' = any (proargnames)
  ) then
    raise exception 'SITE-5 failed: site_list_match_roster returns player_id';
  end if;

  -- SITE-6
  select crest_path into v_text from public.site_list_clubs() where id = v_club_a;
  if v_text is distinct from 'crests/a.svg' then
    raise exception 'SITE-6 failed: granted crest_path was %', v_text;
  end if;
  select crest_path into v_text from public.site_list_clubs() where id = v_club_b;
  if v_text is not null then
    raise exception 'SITE-6 failed: crest_path returned without permission';
  end if;

  -- SITE-7
  foreach v_text in array array['seasons', 'competitions', 'public_venues', 'clubs', 'standings'] loop
    v_failed := false;
    begin
      execute format('select 1 from public.%I limit 1', v_text);
    exception when insufficient_privilege then
      v_failed := true;
    end;
    if not v_failed then
      raise exception 'SITE-7 failed: anon can select %', v_text;
    end if;
  end loop;
  if exists (
    select 1 from pg_proc
    where proname like 'site\_%' and pronamespace = 'public'::regnamespace
      and ('training_venue_id' = any (proargnames) or 'embed_check_status' = any (proargnames))
  ) then
    raise exception 'SITE-7 failed: a site_* RPC returns an admin-only column';
  end if;
  select count(*) into v_count from public.site_list_venues() where id = v_venue;
  if v_count <> 1 then
    raise exception 'SITE-7 failed: site_list_venues did not return the venue';
  end if;

  -- SITE-9
  select string_agg(c.slug || ':' || s.after_round || ':' || s.rank, ',' order by s.rank)
  into v_text
  from public.site_get_standings(null, v_comp) s
  join (select id, slug from public.site_list_clubs()) c on c.id = s.club_id;
  if v_text is distinct from 'site-club-b:2:1,site-club-a:2:2' then
    raise exception 'SITE-9 failed: standings were %', v_text;
  end if;

  -- SITE-10
  if exists (select 1 from public.site_get_match(v_hidden)) then
    raise exception 'SITE-10 failed: unpublished match visible';
  end if;
  if exists (select 1 from public.site_get_match(v_deleted)) then
    raise exception 'SITE-10 failed: soft-deleted match visible';
  end if;

  reset role;

  -- SITE-2 / SITE-3 / SITE-4: restore keeps the publish flag and clears result time.
  perform public.admin_restore_match(v_postpone);
  perform public.admin_restore_match(v_cancel);
  perform public.admin_restore_match(v_result);
  select public_status, is_published into v_status, v_published from public.match_publications where session_id = v_postpone;
  if v_status <> 'scheduled' or not v_published then
    raise exception 'SITE-3 failed: restore gave % / published=%', v_status, v_published;
  end if;
  select is_published into v_published from public.match_publications where session_id = v_cancel;
  if not v_published then
    raise exception 'SITE-2 failed: cancelled then restored match was unpublished';
  end if;
  select result_entered_at into v_ts from public.match_publications where session_id = v_result;
  if v_ts is not null then
    raise exception 'SITE-4 failed: restore kept result_entered_at';
  end if;

  execute 'set local role anon';
  select live_video_id into v_text from public.site_get_match(v_postpone);
  if v_text is distinct from 'abcdefghijk' then
    raise exception 'SITE-3 failed: restored match live_video_id was %', v_text;
  end if;
  reset role;

  raise notice 'site public api ok';
end
$$;

rollback;
