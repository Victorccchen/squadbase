-- Stage 5B: public match schedule, results, and published rosters.
-- Apply to the staging project only. Do not run against production.
--
-- Schema choice A (locked): cup/league stays on training_sessions so Stage 4B
-- debit (match_debit, 1 per club calendar day) is unchanged. A thin 1:1
-- match_publications row holds opponent, home/away, publish flag, public
-- status, and score. match_roster is the published lineup (player_id +
-- jersey snapshot). Regular/special sessions cannot be published.
--
-- Public visibility (anon + authenticated via security-definer RPCs only):
--   published AND public_status in (scheduled, completed)
--   AND session active AND not soft-deleted AND kind in (cup, league)
-- Cancelled matches are omitted from the public list (not shown as cancelled).
-- Soft-deleted or inactive sessions are also omitted.
--
-- Public RPCs return title, kickoff, venue, opponent, side, status, score,
-- team name, and lineup display-name fields + jersey only. No phones,
-- emails, guardian info, credits, claims, notes, or birth dates.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'match_side'
      and n.nspname = 'public'
  ) then
    create type public.match_side as enum ('home', 'away');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'match_public_status'
      and n.nspname = 'public'
  ) then
    create type public.match_public_status as enum ('scheduled', 'completed', 'cancelled');
  end if;
end
$$;

create table if not exists public.match_publications (
  session_id uuid primary key references public.training_sessions (id) on delete cascade,
  opponent text not null,
  side public.match_side not null,
  is_published boolean not null default false,
  public_status public.match_public_status not null default 'scheduled',
  club_score integer,
  opponent_score integer,
  result_note text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint match_publications_opponent_length
    check (char_length(btrim(opponent)) >= 1 and char_length(opponent) <= 200),
  constraint match_publications_result_note_length
    check (result_note is null or char_length(result_note) <= 200),
  constraint match_publications_club_score_range
    check (club_score is null or (club_score >= 0 and club_score <= 99)),
  constraint match_publications_opponent_score_range
    check (opponent_score is null or (opponent_score >= 0 and opponent_score <= 99)),
  constraint match_publications_scores_when_completed check (
    (
      public_status = 'completed'
      and club_score is not null
      and opponent_score is not null
    )
    or (
      public_status is distinct from 'completed'
      and club_score is null
      and opponent_score is null
    )
  )
);

create table if not exists public.match_roster (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.match_publications (session_id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  jersey_number integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint match_roster_jersey_range
    check (jersey_number >= 1 and jersey_number <= 99),
  constraint match_roster_session_player_key unique (session_id, player_id)
);

create index if not exists match_publications_is_published_idx
  on public.match_publications (is_published);

create index if not exists match_publications_public_status_idx
  on public.match_publications (public_status);

create index if not exists match_roster_session_id_idx
  on public.match_roster (session_id);

create index if not exists match_roster_player_id_idx
  on public.match_roster (player_id);

comment on type public.match_side is
  'Club home or away for a published cup/league match.';
comment on type public.match_public_status is
  'Public match lifecycle. cancelled rows are hidden from anon lists (T5B-5).';
comment on table public.match_publications is
  '1:1 public overlay on a cup/league training_session. Staff notes and debit fields stay on training_sessions.';
comment on table public.match_roster is
  'Published lineup. jersey_number is snapshotted from team_memberships at save. Names are read live via RPC (display-name helpers).';
comment on column public.match_publications.is_published is
  'Admin publish switch. Unpublished matches are invisible to anon even if scheduled.';
comment on column public.match_publications.public_status is
  'scheduled / completed / cancelled. completed requires both scores.';

drop trigger if exists match_publications_set_updated_at on public.match_publications;
create trigger match_publications_set_updated_at
  before update on public.match_publications
  for each row
  execute function public.set_updated_at();

drop trigger if exists match_publications_set_actor_columns on public.match_publications;
create trigger match_publications_set_actor_columns
  before insert or update on public.match_publications
  for each row
  execute function public.set_actor_columns();

drop trigger if exists match_roster_set_updated_at on public.match_roster;
create trigger match_roster_set_updated_at
  before update on public.match_roster
  for each row
  execute function public.set_updated_at();

drop trigger if exists match_roster_set_actor_columns on public.match_roster;
create trigger match_roster_set_actor_columns
  before insert or update on public.match_roster
  for each row
  execute function public.set_actor_columns();

create or replace function public.match_is_publicly_visible(p_session_id uuid)
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
      and p.public_status in ('scheduled', 'completed')
      and s.status = 'active'
      and s.deleted_at is null
      and s.kind in ('cup', 'league')
  );
$$;

comment on function public.match_is_publicly_visible(uuid) is
  'True when anon may see the match: published, not cancelled, cup/league, active, not soft-deleted.';

create or replace function public.list_published_matches()
returns table (
  id uuid,
  team_id uuid,
  team_name text,
  title text,
  kind public.session_kind,
  is_playoff boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  opponent text,
  side public.match_side,
  public_status public.match_public_status,
  club_score integer,
  opponent_score integer,
  result_note text
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
    s.title,
    s.kind,
    s.is_playoff,
    s.starts_at,
    s.ends_at,
    s.location,
    p.opponent,
    p.side,
    p.public_status,
    p.club_score,
    p.opponent_score,
    p.result_note
  from public.match_publications p
  join public.training_sessions s on s.id = p.session_id
  join public.teams t on t.id = s.team_id
  where public.match_is_publicly_visible(s.id)
    and s.starts_at >= (now() - interval '90 days')
  order by s.starts_at asc;
$$;

create or replace function public.get_published_match(p_session_id uuid)
returns table (
  id uuid,
  team_id uuid,
  team_name text,
  title text,
  kind public.session_kind,
  is_playoff boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  opponent text,
  side public.match_side,
  public_status public.match_public_status,
  club_score integer,
  opponent_score integer,
  result_note text
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
    s.title,
    s.kind,
    s.is_playoff,
    s.starts_at,
    s.ends_at,
    s.location,
    p.opponent,
    p.side,
    p.public_status,
    p.club_score,
    p.opponent_score,
    p.result_note
  from public.match_publications p
  join public.training_sessions s on s.id = p.session_id
  join public.teams t on t.id = s.team_id
  where s.id = p_session_id
    and public.match_is_publicly_visible(s.id);
$$;

create or replace function public.list_published_match_roster(p_session_id uuid)
returns table (
  player_id uuid,
  name_zh text,
  name_en_given text,
  name_en_family text,
  name_ja text,
  jersey_number integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.player_id,
    pl.name_zh,
    pl.name_en_given,
    pl.name_en_family,
    pl.name_ja,
    r.jersey_number
  from public.match_roster r
  join public.players pl on pl.id = r.player_id
  where r.session_id = p_session_id
    and public.match_is_publicly_visible(p_session_id)
  order by r.jersey_number asc, pl.name_en_family asc, pl.name_en_given asc;
$$;

comment on function public.list_published_matches() is
  'Anon-safe schedule: upcoming plus past 90 days. No staff notes, debit, or contact fields.';
comment on function public.get_published_match(uuid) is
  'Anon-safe match detail. Empty when unpublished, cancelled, deleted, or inactive.';
comment on function public.list_published_match_roster(uuid) is
  'Anon-safe lineup: display-name columns + jersey only. No birth_date, phone, or credits.';

create or replace function public.admin_create_match(
  p_team_id uuid,
  p_title text,
  p_kind public.session_kind,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location text default null,
  p_notes text default null,
  p_opponent text default null,
  p_side public.match_side default 'home',
  p_is_playoff boolean default false,
  p_is_published boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_location text;
  v_notes text;
  v_opponent text;
  v_session_id uuid;
  v_playoff boolean;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_kind is null or p_kind not in ('cup', 'league') then
    raise exception 'match kind must be cup or league' using errcode = '22023';
  end if;

  v_title := btrim(coalesce(p_title, ''));
  if char_length(v_title) < 1 then
    raise exception 'title required' using errcode = '22023';
  end if;
  v_title := left(v_title, 200);

  if p_ends_at <= p_starts_at then
    raise exception 'end time must be after start time' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.teams where id = p_team_id) then
    raise exception 'team not found' using errcode = 'P0002';
  end if;

  v_opponent := btrim(coalesce(p_opponent, ''));
  if char_length(v_opponent) < 1 then
    raise exception 'opponent required' using errcode = '22023';
  end if;
  v_opponent := left(v_opponent, 200);

  if p_side is null then
    raise exception 'invalid match side' using errcode = '22023';
  end if;

  v_location := nullif(btrim(coalesce(p_location, '')), '');
  if v_location is not null then
    v_location := left(v_location, 200);
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null then
    v_notes := left(v_notes, 1000);
  end if;

  v_playoff := coalesce(p_is_playoff, false) and p_kind = 'league';

  insert into public.training_sessions (
    team_id,
    title,
    kind,
    starts_at,
    ends_at,
    location,
    notes,
    status,
    is_playoff,
    created_by,
    updated_by
  )
  values (
    p_team_id,
    v_title,
    p_kind,
    p_starts_at,
    p_ends_at,
    v_location,
    v_notes,
    'active',
    v_playoff,
    auth.uid(),
    auth.uid()
  )
  returning id into v_session_id;

  insert into public.match_publications (
    session_id,
    opponent,
    side,
    is_published,
    public_status,
    published_at,
    created_by,
    updated_by
  )
  values (
    v_session_id,
    v_opponent,
    p_side,
    coalesce(p_is_published, false),
    'scheduled',
    case when coalesce(p_is_published, false) then now() else null end,
    auth.uid(),
    auth.uid()
  );

  return v_session_id;
end;
$$;

create or replace function public.admin_upsert_match_publication(
  p_session_id uuid,
  p_opponent text,
  p_side public.match_side,
  p_is_published boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind public.session_kind;
  v_opponent text;
  v_exists boolean;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select s.kind into v_kind
  from public.training_sessions s
  where s.id = p_session_id;

  if v_kind is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  if v_kind not in ('cup', 'league') then
    raise exception 'match kind must be cup or league' using errcode = '22023';
  end if;

  v_opponent := btrim(coalesce(p_opponent, ''));
  if char_length(v_opponent) < 1 then
    raise exception 'opponent required' using errcode = '22023';
  end if;
  v_opponent := left(v_opponent, 200);

  if p_side is null then
    raise exception 'invalid match side' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.match_publications where session_id = p_session_id
  ) into v_exists;

  if v_exists then
    update public.match_publications
    set
      opponent = v_opponent,
      side = p_side,
      updated_by = auth.uid()
    where session_id = p_session_id;
  else
    insert into public.match_publications (
      session_id,
      opponent,
      side,
      is_published,
      public_status,
      published_at,
      created_by,
      updated_by
    )
    values (
      p_session_id,
      v_opponent,
      p_side,
      coalesce(p_is_published, false),
      'scheduled',
      case when coalesce(p_is_published, false) then now() else null end,
      auth.uid(),
      auth.uid()
    );
  end if;

  return p_session_id;
end;
$$;

create or replace function public.admin_update_match(
  p_session_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location text default null,
  p_notes text default null,
  p_opponent text default null,
  p_side public.match_side default 'home',
  p_is_playoff boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_location text;
  v_notes text;
  v_opponent text;
  v_kind public.session_kind;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select s.kind into v_kind
  from public.training_sessions s
  where s.id = p_session_id;

  if v_kind is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.match_publications where session_id = p_session_id
  ) then
    raise exception 'match not found' using errcode = 'P0002';
  end if;

  v_title := btrim(coalesce(p_title, ''));
  if char_length(v_title) < 1 then
    raise exception 'title required' using errcode = '22023';
  end if;
  v_title := left(v_title, 200);

  if p_ends_at <= p_starts_at then
    raise exception 'end time must be after start time' using errcode = 'P0001';
  end if;

  v_opponent := btrim(coalesce(p_opponent, ''));
  if char_length(v_opponent) < 1 then
    raise exception 'opponent required' using errcode = '22023';
  end if;
  v_opponent := left(v_opponent, 200);

  if p_side is null then
    raise exception 'invalid match side' using errcode = '22023';
  end if;

  v_location := nullif(btrim(coalesce(p_location, '')), '');
  if v_location is not null then
    v_location := left(v_location, 200);
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null then
    v_notes := left(v_notes, 1000);
  end if;

  update public.training_sessions
  set
    title = v_title,
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    location = v_location,
    notes = v_notes,
    is_playoff = coalesce(p_is_playoff, false) and v_kind = 'league',
    updated_by = auth.uid()
  where id = p_session_id;

  update public.match_publications
  set
    opponent = v_opponent,
    side = p_side,
    updated_by = auth.uid()
  where session_id = p_session_id;

  return p_session_id;
end;
$$;

create or replace function public.admin_set_match_published(
  p_session_id uuid,
  p_is_published boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.match_public_status;
  v_session_status public.org_status;
  v_deleted timestamptz;
  v_kind public.session_kind;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select p.public_status, s.status, s.deleted_at, s.kind
    into v_status, v_session_status, v_deleted, v_kind
  from public.match_publications p
  join public.training_sessions s on s.id = p.session_id
  where p.session_id = p_session_id;

  if v_kind is null then
    raise exception 'match not found' using errcode = 'P0002';
  end if;

  if coalesce(p_is_published, false) then
    if v_status = 'cancelled' then
      raise exception 'match is cancelled' using errcode = 'P0001';
    end if;
    if v_session_status is distinct from 'active' or v_deleted is not null then
      raise exception 'session is not active' using errcode = 'P0001';
    end if;
    if v_kind not in ('cup', 'league') then
      raise exception 'match kind must be cup or league' using errcode = '22023';
    end if;
  end if;

  update public.match_publications
  set
    is_published = coalesce(p_is_published, false),
    published_at = case
      when coalesce(p_is_published, false) then coalesce(published_at, now())
      else published_at
    end,
    updated_by = auth.uid()
  where session_id = p_session_id;

  return p_session_id;
end;
$$;

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
    updated_by = auth.uid()
  where session_id = p_session_id;

  return p_session_id;
end;
$$;

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
    is_published = false,
    club_score = null,
    opponent_score = null,
    result_note = null,
    updated_by = auth.uid()
  where session_id = p_session_id;

  return p_session_id;
end;
$$;

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
    is_published = false,
    club_score = null,
    opponent_score = null,
    result_note = null,
    updated_by = auth.uid()
  where session_id = p_session_id;

  return p_session_id;
end;
$$;

create or replace function public.admin_set_match_roster(
  p_session_id uuid,
  p_player_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_ids uuid[];
  v_requested integer;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select s.team_id into v_team
  from public.training_sessions s
  join public.match_publications p on p.session_id = s.id
  where s.id = p_session_id;

  if v_team is null then
    raise exception 'match not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct pid), '{}')
    into v_ids
  from unnest(coalesce(p_player_ids, '{}')) as pid
  where pid is not null;

  v_requested := coalesce(array_length(v_ids, 1), 0);

  if v_requested > 99 then
    raise exception 'match roster player is not on this team' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_ids) as pid
    where not exists (
      select 1
      from public.team_memberships m
      where m.player_id = pid
        and m.team_id = v_team
        and m.status = 'active'
    )
  ) then
    raise exception 'match roster player is not on this team' using errcode = 'P0001';
  end if;

  delete from public.match_roster
  where session_id = p_session_id;

  insert into public.match_roster (
    session_id,
    player_id,
    jersey_number,
    created_by,
    updated_by
  )
  select
    p_session_id,
    m.player_id,
    m.jersey_number,
    auth.uid(),
    auth.uid()
  from public.team_memberships m
  where m.team_id = v_team
    and m.status = 'active'
    and m.player_id = any (v_ids);

  return p_session_id;
end;
$$;

comment on function public.admin_create_match(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, text, public.match_side, boolean, boolean) is
  'Admin-only. Creates one cup/league training_session plus match_publications. Does not change debit rules.';
comment on function public.admin_upsert_match_publication(uuid, text, public.match_side, boolean) is
  'Admin-only. Attach or update opponent/side on an existing cup/league session.';
comment on function public.admin_update_match(uuid, text, timestamptz, timestamptz, text, text, text, public.match_side, boolean) is
  'Admin-only. Update session title/times/venue and public opponent/side.';
comment on function public.admin_set_match_published(uuid, boolean) is
  'Admin-only publish/unpublish. Cancelled or inactive/deleted sessions cannot be published.';
comment on function public.admin_set_match_result(uuid, integer, integer, text) is
  'Admin-only. Marks the match completed and stores the score.';
comment on function public.admin_cancel_match(uuid) is
  'Admin-only soft-cancel. Unpublishes and hides from the public list. Does not soft-delete the training session.';
comment on function public.admin_restore_match(uuid) is
  'Admin-only. Returns a cancelled match to scheduled and unpublished.';
comment on function public.admin_set_match_roster(uuid, uuid[]) is
  'Admin-only. Replaces the published lineup from active team memberships and snapshots jersey numbers.';

revoke all on function public.match_is_publicly_visible(uuid) from public, anon, authenticated;
revoke all on function public.list_published_matches() from public;
revoke all on function public.get_published_match(uuid) from public;
revoke all on function public.list_published_match_roster(uuid) from public;
revoke all on function public.admin_create_match(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, text, public.match_side, boolean, boolean) from public, anon;
revoke all on function public.admin_upsert_match_publication(uuid, text, public.match_side, boolean) from public, anon;
revoke all on function public.admin_update_match(uuid, text, timestamptz, timestamptz, text, text, text, public.match_side, boolean) from public, anon;
revoke all on function public.admin_set_match_published(uuid, boolean) from public, anon;
revoke all on function public.admin_set_match_result(uuid, integer, integer, text) from public, anon;
revoke all on function public.admin_cancel_match(uuid) from public, anon;
revoke all on function public.admin_restore_match(uuid) from public, anon;
revoke all on function public.admin_set_match_roster(uuid, uuid[]) from public, anon;

grant execute on function public.list_published_matches() to anon, authenticated;
grant execute on function public.get_published_match(uuid) to anon, authenticated;
grant execute on function public.list_published_match_roster(uuid) to anon, authenticated;
grant execute on function public.admin_create_match(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, text, public.match_side, boolean, boolean) to authenticated;
grant execute on function public.admin_upsert_match_publication(uuid, text, public.match_side, boolean) to authenticated;
grant execute on function public.admin_update_match(uuid, text, timestamptz, timestamptz, text, text, text, public.match_side, boolean) to authenticated;
grant execute on function public.admin_set_match_published(uuid, boolean) to authenticated;
grant execute on function public.admin_set_match_result(uuid, integer, integer, text) to authenticated;
grant execute on function public.admin_cancel_match(uuid) to authenticated;
grant execute on function public.admin_restore_match(uuid) to authenticated;
grant execute on function public.admin_set_match_roster(uuid, uuid[]) to authenticated;

grant usage on type public.match_side to anon, authenticated;
grant usage on type public.match_public_status to anon, authenticated;
grant usage on type public.session_kind to anon, authenticated;

alter table public.match_publications enable row level security;
alter table public.match_roster enable row level security;

revoke all on table public.match_publications from public, anon;
revoke all on table public.match_roster from public, anon;

grant select, insert, update, delete on table public.match_publications to authenticated;
grant select, insert, update, delete on table public.match_roster to authenticated;

drop policy if exists match_publications_select_admin on public.match_publications;
create policy match_publications_select_admin
  on public.match_publications
  for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists match_publications_select_assigned_coach on public.match_publications;
create policy match_publications_select_assigned_coach
  on public.match_publications
  for select
  to authenticated
  using (public.coach_can_read_session(session_id));

drop policy if exists match_publications_insert_admin on public.match_publications;
create policy match_publications_insert_admin
  on public.match_publications
  for insert
  to authenticated
  with check (public.has_role('admin'));

drop policy if exists match_publications_update_admin on public.match_publications;
create policy match_publications_update_admin
  on public.match_publications
  for update
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists match_publications_delete_admin on public.match_publications;
create policy match_publications_delete_admin
  on public.match_publications
  for delete
  to authenticated
  using (public.has_role('admin'));

drop policy if exists match_roster_select_admin on public.match_roster;
create policy match_roster_select_admin
  on public.match_roster
  for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists match_roster_select_assigned_coach on public.match_roster;
create policy match_roster_select_assigned_coach
  on public.match_roster
  for select
  to authenticated
  using (public.coach_can_read_session(session_id));

drop policy if exists match_roster_insert_admin on public.match_roster;
create policy match_roster_insert_admin
  on public.match_roster
  for insert
  to authenticated
  with check (public.has_role('admin'));

drop policy if exists match_roster_update_admin on public.match_roster;
create policy match_roster_update_admin
  on public.match_roster
  for update
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists match_roster_delete_admin on public.match_roster;
create policy match_roster_delete_admin
  on public.match_roster
  for delete
  to authenticated
  using (public.has_role('admin'));
