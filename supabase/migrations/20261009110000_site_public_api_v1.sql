-- Futuro site phase 1a, database side (spec v4 §5.1, §5.2, §8.1, §8.2, 13-A1/A2).
-- Staging only. Do not run against production.
-- Requires 20261009100000_match_status_postponed.sql.
--
-- 1. New reference tables: seasons, competitions, public_venues, clubs,
--    standings. public_venues is separate from the existing venues table,
--    which holds QR check-in secrets (PR-07); a match must never set
--    training_sessions.venue_id (that opens parent check-in and head-count
--    tasks).
-- 2. match_publications gains listing fields (opponent club, public venue,
--    season, competition, round), broadcast fields (CTFA TV video ids, embed
--    switch and check), and result_entered_at.
-- 3. Admin RPCs: cancel and restore keep is_published (a cancelled match stays
--    on the public schedule, marked cancelled); new admin_postpone_match;
--    admin_set_match_result records result_entered_at; new
--    admin_set_match_broadcast and admin_set_match_listing.
-- 4. Public API v1 for the official site (separate repo): site_* RPCs only,
--    callable by anon, explicit columns, whole season (no 90-day window),
--    rosters limited to senior/reserve and players 18+ on match day, crest
--    paths only with permission. The existing list_published_* RPCs used by
--    the Squadbase portal are unchanged.
-- 5. Seed: the first team (台中FUTURO 一線隊), season 2026/27 and the TFPL
--    competition. Clubs, venues and fixtures are data and are imported
--    separately after review.
--
-- Every new object is revoked from public/anon and granted explicitly
-- (Supabase cloud exposes new objects by default). anon_surface_verification.sql
-- lists the allowed anon functions; site_public_api_verification.sql covers
-- behaviour.

-- 1. Reference tables -------------------------------------------------------------------------

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasons_label_unique unique (label),
  constraint seasons_label_length check (char_length(btrim(label)) between 1 and 20),
  constraint seasons_dates check (ends_on > starts_on)
);

create unique index if not exists seasons_one_current
  on public.seasons (is_current) where is_current;

comment on table public.seasons is
  'Competition seasons for the official site (e.g. 2026/27). Not the youth age cut-off (season_start_on).';

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name_zh text not null,
  name_ja text,
  name_en text,
  short text,
  kind text not null,
  organizer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competitions_slug_unique unique (slug),
  constraint competitions_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint competitions_kind check (kind in ('league', 'cup', 'continental', 'friendly')),
  constraint competitions_name_length check (char_length(btrim(name_zh)) between 1 and 120)
);

create table if not exists public.public_venues (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name_zh text not null,
  name_ja text,
  name_en text,
  address_zh text,
  address_en text,
  lat numeric(8, 5),
  lng numeric(8, 5),
  map_url text,
  transit_zh text,
  transit_ja text,
  transit_en text,
  parking_zh text,
  parking_ja text,
  parking_en text,
  accessibility_zh text,
  capacity integer,
  surface text,
  training_venue_id uuid references public.venues (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_venues_slug_unique unique (slug),
  constraint public_venues_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint public_venues_name_length check (char_length(btrim(name_zh)) between 1 and 120),
  constraint public_venues_lat check (lat is null or lat between -90 and 90),
  constraint public_venues_lng check (lng is null or lng between -180 and 180),
  constraint public_venues_capacity check (capacity is null or capacity between 0 and 200000),
  constraint public_venues_surface check (surface is null or surface in ('natural', 'artificial', 'mixed')),
  constraint public_venues_map_url check (map_url is null or map_url ~ '^https://')
);

comment on table public.public_venues is
  'Public match venues for the official site. Not public.venues (training venues with QR check-in secrets).';
comment on column public.public_venues.training_venue_id is
  'Optional link to the training venue at the same ground. Admin-only; never returned by site_* RPCs.';

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name_zh text not null,
  name_ja text,
  name_en text,
  short_zh text,
  short_en text,
  abbr text,
  crest_path text,
  crest_permission text not null default 'unknown',
  home_venue_id uuid references public.public_venues (id) on delete set null,
  website_url text,
  instagram_url text,
  facebook_url text,
  youtube_url text,
  is_self boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clubs_slug_unique unique (slug),
  constraint clubs_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint clubs_name_length check (char_length(btrim(name_zh)) between 1 and 120),
  constraint clubs_abbr_format check (abbr is null or abbr ~ '^[A-Z0-9]{2,4}$'),
  constraint clubs_crest_permission check (crest_permission in ('unknown', 'granted', 'denied')),
  constraint clubs_urls check (
    (website_url is null or website_url ~ '^https://')
    and (instagram_url is null or instagram_url ~ '^https://')
    and (facebook_url is null or facebook_url ~ '^https://')
    and (youtube_url is null or youtube_url ~ '^https://')
  )
);

create unique index if not exists clubs_one_self on public.clubs (is_self) where is_self;

comment on column public.clubs.crest_permission is
  'site_list_clubs returns crest_path only when granted; otherwise the site shows an abbr badge.';

create table if not exists public.standings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  competition_id uuid not null references public.competitions (id) on delete cascade,
  after_round integer not null,
  club_id uuid not null references public.clubs (id) on delete cascade,
  rank integer not null,
  played integer not null default 0,
  won integer not null default 0,
  drawn integer not null default 0,
  lost integer not null default 0,
  goals_for integer not null default 0,
  goals_against integer not null default 0,
  points integer not null default 0,
  is_official boolean not null default true,
  source_url text,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint standings_row_unique unique (season_id, competition_id, after_round, club_id),
  constraint standings_numbers check (
    after_round between 0 and 99 and rank between 1 and 99
    and played >= 0 and won >= 0 and drawn >= 0 and lost >= 0
    and goals_for >= 0 and goals_against >= 0
    and won + drawn + lost = played
  ),
  constraint standings_source_url check (source_url is null or source_url ~ '^https://')
);

comment on table public.standings is
  'League table after each round (manual or imported). Unique per club per round; ranks may tie.';

drop trigger if exists seasons_set_updated_at on public.seasons;
create trigger seasons_set_updated_at before update on public.seasons
  for each row execute function public.set_updated_at();
drop trigger if exists competitions_set_updated_at on public.competitions;
create trigger competitions_set_updated_at before update on public.competitions
  for each row execute function public.set_updated_at();
drop trigger if exists public_venues_set_updated_at on public.public_venues;
create trigger public_venues_set_updated_at before update on public.public_venues
  for each row execute function public.set_updated_at();
drop trigger if exists clubs_set_updated_at on public.clubs;
create trigger clubs_set_updated_at before update on public.clubs
  for each row execute function public.set_updated_at();
drop trigger if exists standings_set_updated_at on public.standings;
create trigger standings_set_updated_at before update on public.standings
  for each row execute function public.set_updated_at();

-- RLS: admins manage these tables directly; everyone else reads through site_* RPCs.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['seasons', 'competitions', 'public_venues', 'clubs', 'standings'] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_admin_all', v_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_role(''admin'')) with check (public.has_role(''admin''))',
      v_table || '_admin_all',
      v_table
    );
  end loop;
end
$$;

-- 2. match_publications: listing, broadcast, result time --------------------------------------

alter table public.match_publications
  add column if not exists opponent_club_id uuid references public.clubs (id) on delete set null,
  add column if not exists public_venue_id uuid references public.public_venues (id) on delete set null,
  add column if not exists season_id uuid references public.seasons (id) on delete set null,
  add column if not exists competition_id uuid references public.competitions (id) on delete set null,
  add column if not exists round_no integer,
  add column if not exists round_label text,
  add column if not exists live_stream_url text,
  add column if not exists live_video_id text,
  add column if not exists replay_url text,
  add column if not exists replay_video_id text,
  add column if not exists highlights_url text,
  add column if not exists highlights_video_id text,
  add column if not exists embed_enabled boolean not null default true,
  add column if not exists embed_check_status text not null default 'unknown',
  add column if not exists embed_checked_at timestamptz,
  add column if not exists video_title text,
  add column if not exists live_window_before_min integer,
  add column if not exists result_entered_at timestamptz;

alter table public.match_publications
  drop constraint if exists match_publications_round,
  add constraint match_publications_round check (
    (round_no is null or round_no between 1 and 99)
    and (round_label is null or char_length(round_label) <= 40)
  ),
  drop constraint if exists match_publications_video_ids,
  add constraint match_publications_video_ids check (
    (live_video_id is null or live_video_id ~ '^[A-Za-z0-9_-]{11}$')
    and (replay_video_id is null or replay_video_id ~ '^[A-Za-z0-9_-]{11}$')
    and (highlights_video_id is null or highlights_video_id ~ '^[A-Za-z0-9_-]{11}$')
  ),
  drop constraint if exists match_publications_video_urls,
  add constraint match_publications_video_urls check (
    (live_stream_url is null or char_length(live_stream_url) <= 500)
    and (replay_url is null or char_length(replay_url) <= 500)
    and (highlights_url is null or char_length(highlights_url) <= 500)
    and (video_title is null or char_length(video_title) <= 300)
  ),
  drop constraint if exists match_publications_embed_check_status,
  add constraint match_publications_embed_check_status check (
    embed_check_status in ('unknown', 'ok', 'blocked', 'not_found')
  ),
  drop constraint if exists match_publications_live_window,
  add constraint match_publications_live_window check (
    live_window_before_min is null or live_window_before_min between 0 and 180
  ),
  drop constraint if exists match_publications_result_entered_at,
  add constraint match_publications_result_entered_at check (
    result_entered_at is null or public_status = 'completed'
  );

-- Completed matches before this migration: the best known time is the last edit.
update public.match_publications
set result_entered_at = updated_at
where public_status = 'completed' and result_entered_at is null;

comment on column public.match_publications.result_entered_at is
  'When admin_set_match_result last stored the score. Ends the live window early on the site.';
comment on column public.match_publications.embed_check_status is
  'YouTube oEmbed result at save time. Admin-only; site_* RPCs return embed_enabled, never this.';

-- 3. Admin RPCs -------------------------------------------------------------------------------

create or replace function public.admin_set_match_result(
  p_session_id uuid,
  p_club_score integer,
  p_opponent_score integer,
  p_result_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.match_public_status;
  v_note text;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select public_status into v_status
  from public.match_publications
  where session_id = p_session_id;

  if v_status is null then
    raise exception 'match not found' using errcode = 'P0002';
  end if;

  if v_status = 'cancelled' then
    raise exception 'match is cancelled' using errcode = 'P0001';
  end if;

  if v_status = 'postponed' then
    raise exception 'match is postponed' using errcode = 'P0001';
  end if;

  if p_club_score is null or p_opponent_score is null
     or p_club_score < 0 or p_opponent_score < 0
     or p_club_score > 99 or p_opponent_score > 99 then
    raise exception 'invalid match score' using errcode = '22023';
  end if;

  v_note := nullif(btrim(coalesce(p_result_note, '')), '');
  if v_note is not null then
    v_note := left(v_note, 200);
  end if;

  update public.match_publications
  set
    public_status = 'completed',
    club_score = p_club_score,
    opponent_score = p_opponent_score,
    result_note = v_note,
    result_entered_at = now(),
    updated_by = auth.uid()
  where session_id = p_session_id;

  return p_session_id;
end;
$$;

-- Cancel no longer unpublishes: the public schedule shows the match as cancelled.
create or replace function public.admin_cancel_match(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.match_publications where session_id = p_session_id
  ) then
    raise exception 'match not found' using errcode = 'P0002';
  end if;

  update public.match_publications
  set
    public_status = 'cancelled',
    club_score = null,
    opponent_score = null,
    result_note = null,
    result_entered_at = null,
    updated_by = auth.uid()
  where session_id = p_session_id;

  return p_session_id;
end;
$$;

-- Restore (from cancelled or postponed) keeps the publish flag as it was.
create or replace function public.admin_restore_match(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.match_publications where session_id = p_session_id
  ) then
    raise exception 'match not found' using errcode = 'P0002';
  end if;

  update public.match_publications
  set
    public_status = 'scheduled',
    club_score = null,
    opponent_score = null,
    result_note = null,
    result_entered_at = null,
    updated_by = auth.uid()
  where session_id = p_session_id;

  return p_session_id;
end;
$$;

-- Postpone: date to be confirmed. Keeps starts_at; restore returns it to scheduled.
create or replace function public.admin_postpone_match(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.match_public_status;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select public_status into v_status
  from public.match_publications
  where session_id = p_session_id;

  if v_status is null then
    raise exception 'match not found' using errcode = 'P0002';
  end if;

  if v_status = 'cancelled' then
    raise exception 'match is cancelled' using errcode = 'P0001';
  end if;

  if v_status = 'completed' then
    raise exception 'match is completed' using errcode = 'P0001';
  end if;

  update public.match_publications
  set
    public_status = 'postponed',
    club_score = null,
    opponent_score = null,
    result_note = null,
    result_entered_at = null,
    updated_by = auth.uid()
  where session_id = p_session_id;

  return p_session_id;
end;
$$;

-- Broadcast fields. The app parses the pasted URLs and runs the oEmbed check;
-- this RPC stores the result and re-validates the ids.
create or replace function public.admin_set_match_broadcast(
  p_session_id uuid,
  p_live_stream_url text,
  p_live_video_id text,
  p_replay_url text,
  p_replay_video_id text,
  p_highlights_url text,
  p_highlights_video_id text,
  p_embed_enabled boolean,
  p_embed_check_status text,
  p_video_title text,
  p_live_window_before_min integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check text := coalesce(nullif(btrim(p_embed_check_status), ''), 'unknown');
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.match_publications where session_id = p_session_id
  ) then
    raise exception 'match not found' using errcode = 'P0002';
  end if;

  if (nullif(btrim(p_live_stream_url), '') is null) <> (nullif(btrim(p_live_video_id), '') is null)
     or (nullif(btrim(p_replay_url), '') is null) <> (nullif(btrim(p_replay_video_id), '') is null)
     or (nullif(btrim(p_highlights_url), '') is null) <> (nullif(btrim(p_highlights_video_id), '') is null) then
    raise exception 'each video URL needs its video id' using errcode = '22023';
  end if;

  update public.match_publications
  set
    live_stream_url = nullif(btrim(p_live_stream_url), ''),
    live_video_id = nullif(btrim(p_live_video_id), ''),
    replay_url = nullif(btrim(p_replay_url), ''),
    replay_video_id = nullif(btrim(p_replay_video_id), ''),
    highlights_url = nullif(btrim(p_highlights_url), ''),
    highlights_video_id = nullif(btrim(p_highlights_video_id), ''),
    embed_enabled = coalesce(p_embed_enabled, true),
    embed_check_status = v_check,
    embed_checked_at = case when v_check = 'unknown' then null else now() end,
    video_title = left(nullif(btrim(p_video_title), ''), 300),
    live_window_before_min = p_live_window_before_min,
    updated_by = auth.uid()
  where session_id = p_session_id;

  return p_session_id;
end;
$$;

create or replace function public.admin_set_match_listing(
  p_session_id uuid,
  p_opponent_club_id uuid,
  p_public_venue_id uuid,
  p_season_id uuid,
  p_competition_id uuid,
  p_round_no integer,
  p_round_label text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.match_publications where session_id = p_session_id
  ) then
    raise exception 'match not found' using errcode = 'P0002';
  end if;

  update public.match_publications
  set
    opponent_club_id = p_opponent_club_id,
    public_venue_id = p_public_venue_id,
    season_id = p_season_id,
    competition_id = p_competition_id,
    round_no = p_round_no,
    round_label = nullif(btrim(p_round_label), ''),
    updated_by = auth.uid()
  where session_id = p_session_id;

  return p_session_id;
end;
$$;

-- 4. Public API v1 (site_*) -------------------------------------------------------------------

-- Visible to the official site: published, active, not deleted, a match kind,
-- any status (cancelled and postponed stay listed). Internal; not for anon.
create or replace function public.site_match_is_visible(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.match_publications p
    join public.training_sessions s on s.id = p.session_id
    where s.id = p_session_id
      and p.is_published = true
      and s.status = 'active'
      and s.deleted_at is null
      and public.is_match_session_kind(s.kind)
  );
$$;

create or replace function public.site_api_version()
returns integer
language sql
immutable
as $$
  select 1;
$$;

comment on function public.site_api_version() is
  'Contract version of the site_* RPCs. Bump only for a breaking change (fields may be added without a bump).';

-- One row shape for site_list_matches and site_get_match. Internal.
create or replace function public.site_match_rows()
returns table (
  id uuid,
  team_id uuid,
  team_name text,
  team_age_band public.age_band,
  kind public.session_kind,
  is_playoff boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  opponent text,
  opponent_club_id uuid,
  side public.match_side,
  public_status public.match_public_status,
  club_score integer,
  opponent_score integer,
  result_note text,
  result_entered_at timestamptz,
  season_id uuid,
  competition_id uuid,
  round_no integer,
  round_label text,
  public_venue_id uuid,
  live_video_id text,
  replay_video_id text,
  highlights_video_id text,
  embed_enabled boolean,
  live_window_before_min integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.team_id,
    t.name,
    t.age_band,
    s.kind,
    s.is_playoff,
    s.starts_at,
    s.ends_at,
    s.location,
    p.opponent,
    p.opponent_club_id,
    p.side,
    p.public_status,
    p.club_score,
    p.opponent_score,
    p.result_note,
    p.result_entered_at,
    p.season_id,
    p.competition_id,
    p.round_no,
    p.round_label,
    p.public_venue_id,
    case when p.public_status in ('scheduled', 'completed') then p.live_video_id end,
    case when p.public_status in ('scheduled', 'completed') then p.replay_video_id end,
    case when p.public_status in ('scheduled', 'completed') then p.highlights_video_id end,
    p.embed_enabled,
    p.live_window_before_min,
    greatest(p.updated_at, s.updated_at)
  from public.match_publications p
  join public.training_sessions s on s.id = p.session_id
  join public.teams t on t.id = s.team_id
  where public.site_match_is_visible(s.id);
$$;

-- Whole season. Without p_season_id: the current season (matches tagged with it,
-- or untagged matches inside its dates); with no current season, every match.
create or replace function public.site_list_matches(
  p_season_id uuid default null,
  p_team_id uuid default null
)
returns table (
  id uuid,
  team_id uuid,
  team_name text,
  team_age_band public.age_band,
  kind public.session_kind,
  is_playoff boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  opponent text,
  opponent_club_id uuid,
  side public.match_side,
  public_status public.match_public_status,
  club_score integer,
  opponent_score integer,
  result_note text,
  result_entered_at timestamptz,
  season_id uuid,
  competition_id uuid,
  round_no integer,
  round_label text,
  public_venue_id uuid,
  live_video_id text,
  replay_video_id text,
  highlights_video_id text,
  embed_enabled boolean,
  live_window_before_min integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select se.id, se.starts_on, se.ends_on
    from public.seasons se
    where (p_season_id is not null and se.id = p_season_id)
       or (p_season_id is null and se.is_current)
    limit 1
  )
  select m.*
  from public.site_match_rows() m
  left join target on true
  where (p_team_id is null or m.team_id = p_team_id)
    and (
      (p_season_id is null and target.id is null)
      or m.season_id = target.id
      or (
        m.season_id is null
        and target.id is not null
        and (m.starts_at at time zone 'Asia/Taipei')::date between target.starts_on and target.ends_on
      )
    )
  order by m.starts_at asc, m.id asc;
$$;

create or replace function public.site_get_match(p_id uuid)
returns table (
  id uuid,
  team_id uuid,
  team_name text,
  team_age_band public.age_band,
  kind public.session_kind,
  is_playoff boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  opponent text,
  opponent_club_id uuid,
  side public.match_side,
  public_status public.match_public_status,
  club_score integer,
  opponent_score integer,
  result_note text,
  result_entered_at timestamptz,
  season_id uuid,
  competition_id uuid,
  round_no integer,
  round_label text,
  public_venue_id uuid,
  live_video_id text,
  replay_video_id text,
  highlights_video_id text,
  embed_enabled boolean,
  live_window_before_min integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.* from public.site_match_rows() m where m.id = p_id;
$$;

-- Lineup: senior/reserve matches only, players 18+ on the match date. No player id.
create or replace function public.site_list_match_roster(p_id uuid)
returns table (
  jersey_number integer,
  name_zh text,
  name_ja text,
  name_en_given text,
  name_en_family text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.jersey_number, pl.name_zh, pl.name_ja, pl.name_en_given, pl.name_en_family
  from public.match_roster r
  join public.players pl on pl.id = r.player_id
  join public.training_sessions s on s.id = r.session_id
  join public.teams t on t.id = s.team_id
  where r.session_id = p_id
    and public.site_match_is_visible(p_id)
    and t.age_band in ('senior', 'reserve')
    and pl.birth_date <= ((s.starts_at at time zone 'Asia/Taipei')::date - interval '18 years')::date
  order by r.jersey_number asc, pl.name_en_family asc, pl.name_en_given asc;
$$;

create or replace function public.site_list_clubs()
returns table (
  id uuid,
  slug text,
  name_zh text,
  name_ja text,
  name_en text,
  short_zh text,
  short_en text,
  abbr text,
  crest_path text,
  home_venue_id uuid,
  website_url text,
  instagram_url text,
  facebook_url text,
  youtube_url text,
  is_self boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.slug, c.name_zh, c.name_ja, c.name_en, c.short_zh, c.short_en, c.abbr,
    case when c.crest_permission = 'granted' then c.crest_path end,
    c.home_venue_id, c.website_url, c.instagram_url, c.facebook_url, c.youtube_url, c.is_self
  from public.clubs c
  order by c.is_self desc, c.name_zh asc;
$$;

create or replace function public.site_list_venues()
returns table (
  id uuid,
  slug text,
  name_zh text,
  name_ja text,
  name_en text,
  address_zh text,
  address_en text,
  lat numeric,
  lng numeric,
  map_url text,
  transit_zh text,
  transit_ja text,
  transit_en text,
  parking_zh text,
  parking_ja text,
  parking_en text,
  accessibility_zh text,
  capacity integer,
  surface text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id, v.slug, v.name_zh, v.name_ja, v.name_en, v.address_zh, v.address_en, v.lat, v.lng, v.map_url,
    v.transit_zh, v.transit_ja, v.transit_en, v.parking_zh, v.parking_ja, v.parking_en,
    v.accessibility_zh, v.capacity, v.surface
  from public.public_venues v
  order by v.name_zh asc;
$$;

create or replace function public.site_list_seasons()
returns table (id uuid, label text, starts_on date, ends_on date, is_current boolean)
language sql
stable
security definer
set search_path = public
as $$
  select se.id, se.label, se.starts_on, se.ends_on, se.is_current
  from public.seasons se
  order by se.starts_on desc;
$$;

create or replace function public.site_list_competitions()
returns table (
  id uuid,
  slug text,
  name_zh text,
  name_ja text,
  name_en text,
  short text,
  kind text,
  organizer text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.slug, c.name_zh, c.name_ja, c.name_en, c.short, c.kind, c.organizer
  from public.competitions c
  order by c.name_zh asc;
$$;

-- Latest table per competition in the season (default: current season).
create or replace function public.site_get_standings(
  p_season_id uuid default null,
  p_competition_id uuid default null
)
returns table (
  season_id uuid,
  competition_id uuid,
  after_round integer,
  club_id uuid,
  rank integer,
  played integer,
  won integer,
  drawn integer,
  lost integer,
  goals_for integer,
  goals_against integer,
  points integer,
  is_official boolean,
  source_url text,
  fetched_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select se.id
    from public.seasons se
    where (p_season_id is not null and se.id = p_season_id)
       or (p_season_id is null and se.is_current)
    limit 1
  ),
  latest as (
    select st.competition_id, max(st.after_round) as after_round
    from public.standings st
    join target on st.season_id = target.id
    where p_competition_id is null or st.competition_id = p_competition_id
    group by st.competition_id
  )
  select
    st.season_id, st.competition_id, st.after_round, st.club_id, st.rank, st.played, st.won,
    st.drawn, st.lost, st.goals_for, st.goals_against, st.points, st.is_official, st.source_url, st.fetched_at
  from public.standings st
  join target on st.season_id = target.id
  join latest l on l.competition_id = st.competition_id and l.after_round = st.after_round
  order by st.competition_id, st.rank asc, st.points desc;
$$;

-- 5. Grants -----------------------------------------------------------------------------------

revoke all on function public.admin_set_match_result(uuid, integer, integer, text) from public, anon;
revoke all on function public.admin_cancel_match(uuid) from public, anon;
revoke all on function public.admin_restore_match(uuid) from public, anon;
revoke all on function public.admin_postpone_match(uuid) from public, anon;
revoke all on function public.admin_set_match_broadcast(uuid, text, text, text, text, text, text, boolean, text, text, integer) from public, anon;
revoke all on function public.admin_set_match_listing(uuid, uuid, uuid, uuid, uuid, integer, text) from public, anon;
grant execute on function public.admin_set_match_result(uuid, integer, integer, text) to authenticated;
grant execute on function public.admin_cancel_match(uuid) to authenticated;
grant execute on function public.admin_restore_match(uuid) to authenticated;
grant execute on function public.admin_postpone_match(uuid) to authenticated;
grant execute on function public.admin_set_match_broadcast(uuid, text, text, text, text, text, text, boolean, text, text, integer) to authenticated;
grant execute on function public.admin_set_match_listing(uuid, uuid, uuid, uuid, uuid, integer, text) to authenticated;

-- Internal helpers: no direct callers outside other definer functions.
revoke all on function public.site_match_is_visible(uuid) from public, anon, authenticated;
revoke all on function public.site_match_rows() from public, anon, authenticated;

revoke all on function public.site_api_version() from public;
revoke all on function public.site_list_matches(uuid, uuid) from public;
revoke all on function public.site_get_match(uuid) from public;
revoke all on function public.site_list_match_roster(uuid) from public;
revoke all on function public.site_list_clubs() from public;
revoke all on function public.site_list_venues() from public;
revoke all on function public.site_list_seasons() from public;
revoke all on function public.site_list_competitions() from public;
revoke all on function public.site_get_standings(uuid, uuid) from public;
grant execute on function public.site_api_version() to anon, authenticated;
grant execute on function public.site_list_matches(uuid, uuid) to anon, authenticated;
grant execute on function public.site_get_match(uuid) to anon, authenticated;
grant execute on function public.site_list_match_roster(uuid) to anon, authenticated;
grant execute on function public.site_list_clubs() to anon, authenticated;
grant execute on function public.site_list_venues() to anon, authenticated;
grant execute on function public.site_list_seasons() to anon, authenticated;
grant execute on function public.site_list_competitions() to anon, authenticated;
grant execute on function public.site_get_standings(uuid, uuid) to anon, authenticated;

-- 6. Seed -------------------------------------------------------------------------------------

insert into public.teams (name, age_band, status, kind, layer_key, eligible_birth_ages)
select '台中FUTURO 一線隊', 'senior', 'active', 'competition_team', 'senior', array['senior']
where not exists (
  select 1 from public.teams where kind = 'competition_team' and layer_key = 'senior'
);

insert into public.seasons (label, starts_on, ends_on, is_current)
values ('2026/27', date '2026-08-01', date '2027-07-31', true)
on conflict (label) do nothing;

insert into public.competitions (slug, name_zh, name_ja, name_en, short, kind, organizer)
values ('tfpl', '臺灣企業甲級足球聯賽', null, 'Taiwan Football Premier League', '台企甲', 'league', 'CTFA')
on conflict (slug) do nothing;
