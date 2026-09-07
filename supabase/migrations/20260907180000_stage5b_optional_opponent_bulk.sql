-- Stage 5B follow-up: opponent may be unknown when the league calendar
-- is entered months ahead. Bulk-create unpublished cup/league shells.
-- Apply to the staging project only. Do not run against production.
-- Do not rewrite 20260907120000_stage5b_public_matches.sql.
--
-- Opponent: nullable. Blank writes store NULL. When set, 1–200 chars.
-- Public UI shows a TBD label; RPCs never invent a club name.
-- admin_create_matches loops admin_create_match in one transaction.

alter table public.match_publications
  alter column opponent drop not null;

alter table public.match_publications
  drop constraint if exists match_publications_opponent_length;

alter table public.match_publications
  add constraint match_publications_opponent_length
  check (
    opponent is null
    or (
      char_length(btrim(opponent)) >= 1
      and char_length(opponent) <= 200
    )
  );

comment on column public.match_publications.opponent is
  'Optional until the fixture is known. NULL/blank is TBD on public pages; never a fake club name.';

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
  v_side public.match_side;
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

  v_opponent := nullif(btrim(coalesce(p_opponent, '')), '');
  if v_opponent is not null then
    v_opponent := left(v_opponent, 200);
  end if;

  v_side := coalesce(p_side, 'home');

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
    v_side,
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
  v_side public.match_side;
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

  v_opponent := nullif(btrim(coalesce(p_opponent, '')), '');
  if v_opponent is not null then
    v_opponent := left(v_opponent, 200);
  end if;

  v_side := coalesce(p_side, 'home');

  select exists (
    select 1 from public.match_publications where session_id = p_session_id
  ) into v_exists;

  if v_exists then
    update public.match_publications
    set
      opponent = v_opponent,
      side = v_side,
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
      v_side,
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
  v_side public.match_side;
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

  v_opponent := nullif(btrim(coalesce(p_opponent, '')), '');
  if v_opponent is not null then
    v_opponent := left(v_opponent, 200);
  end if;

  v_side := coalesce(p_side, 'home');

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
    side = v_side,
    updated_by = auth.uid()
  where session_id = p_session_id;

  return p_session_id;
end;
$$;

create or replace function public.admin_create_matches(
  p_team_id uuid,
  p_title text,
  p_kind public.session_kind,
  p_starts_at timestamptz[],
  p_ends_at timestamptz[],
  p_location text default null,
  p_notes text default null,
  p_opponent text default null,
  p_side public.match_side default 'home',
  p_is_playoff boolean default false,
  p_is_published boolean default false
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[] := '{}';
  v_n integer;
  v_i integer;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_n := coalesce(array_length(p_starts_at, 1), 0);
  if v_n < 1 then
    raise exception 'kickoff required' using errcode = '22023';
  end if;
  if v_n > 40 then
    raise exception 'too many matches' using errcode = '22023';
  end if;
  if coalesce(array_length(p_ends_at, 1), 0) is distinct from v_n then
    raise exception 'kickoff and end arrays must match' using errcode = '22023';
  end if;

  for v_i in 1..v_n loop
    v_ids := array_append(
      v_ids,
      public.admin_create_match(
        p_team_id,
        p_title,
        p_kind,
        p_starts_at[v_i],
        p_ends_at[v_i],
        p_location,
        p_notes,
        p_opponent,
        coalesce(p_side, 'home'),
        p_is_playoff,
        coalesce(p_is_published, false)
      )
    );
  end loop;

  return v_ids;
end;
$$;

comment on function public.admin_create_match(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, text, public.match_side, boolean, boolean) is
  'Admin-only. Creates one cup/league training_session plus match_publications. Opponent may be null (TBD). Does not change debit rules.';
comment on function public.admin_upsert_match_publication(uuid, text, public.match_side, boolean) is
  'Admin-only. Attach or update opponent/side on an existing cup/league session. Opponent may be null.';
comment on function public.admin_update_match(uuid, text, timestamptz, timestamptz, text, text, text, public.match_side, boolean) is
  'Admin-only. Update session title/times/venue and public opponent/side. Opponent may be cleared to TBD.';
comment on function public.admin_create_matches(uuid, text, public.session_kind, timestamptz[], timestamptz[], text, text, text, public.match_side, boolean, boolean) is
  'Admin-only bulk create. One training_session + match_publications per kickoff. Default unpublished. Opponent may be null. Max 40.';

revoke all on function public.admin_create_matches(uuid, text, public.session_kind, timestamptz[], timestamptz[], text, text, text, public.match_side, boolean, boolean) from public, anon;
grant execute on function public.admin_create_matches(uuid, text, public.session_kind, timestamptz[], timestamptz[], text, text, text, public.match_side, boolean, boolean) to authenticated;
