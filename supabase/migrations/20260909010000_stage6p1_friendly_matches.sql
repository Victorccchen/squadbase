-- Stage 6P.1 step 2 (staging only). Do not run against production.
-- Paste only after 20260909000000_stage6p1_session_kind_friendly.sql committed.
-- Allows friendly on match RPCs / public visibility, and treats friendly as
-- match_debit like cup/league. Does not rewrite earlier Stage 5B files.
-- Idempotent. Safe to re-run.

comment on type public.session_kind is
  'regular = weekly training; special = one-off; cup = short cup series; league = regular season (playoff flag is per occurrence); friendly = 友誼賽 (debit like cup/league).';

create or replace function public.is_match_session_kind(p_kind public.session_kind)
returns boolean
language sql
immutable
as $$
  select p_kind in ('cup', 'league', 'friendly');
$$;

comment on function public.is_match_session_kind(public.session_kind) is
  'True for cup, league, and friendly. Regular/special are training-only.';

revoke all on function public.is_match_session_kind(public.session_kind) from public, anon;
grant execute on function public.is_match_session_kind(public.session_kind) to authenticated;

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
      and public.is_match_session_kind(s.kind)
  );
$$;

comment on function public.match_is_publicly_visible(uuid) is
  'True when anon may see the match: published, not cancelled, cup/league/friendly, active, not soft-deleted.';

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

  if p_kind is null or not public.is_match_session_kind(p_kind) then
    raise exception 'match kind must be cup, league, or friendly' using errcode = '22023';
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

comment on function public.admin_create_match(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, text, public.match_side, boolean, boolean) is
  'Admin-only. Creates one cup/league/friendly training_session plus match_publications. Opponent may be null (TBD). Friendly debit follows cup/league.';

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

  if not public.is_match_session_kind(v_kind) then
    raise exception 'match kind must be cup, league, or friendly' using errcode = '22023';
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

comment on function public.admin_upsert_match_publication(uuid, text, public.match_side, boolean) is
  'Admin-only. Attach or update opponent/side on an existing cup/league/friendly session. Opponent may be null.';

create or replace function public.compute_session_debit_plan(
  p_kind public.session_kind,
  p_team_age_band public.age_band,
  p_attendance_status public.attendance_status,
  p_no_debit boolean,
  p_debit_override_n integer,
  p_excused_leave_approved boolean,
  p_already_debited_same_match_day boolean
)
returns table (
  credits integer,
  entry_type public.credit_ledger_entry_type,
  no_debit_label boolean
)
language plpgsql
immutable
as $$
declare
  v_entry public.credit_ledger_entry_type;
begin
  if p_team_age_band is null
     or not public.credits_apply_to_age_band(p_team_age_band)
     or coalesce(p_no_debit, false) then
    credits := 0;
    entry_type := null;
    no_debit_label := true;
    return next;
    return;
  end if;

  if coalesce(p_excused_leave_approved, false)
     or p_attendance_status = 'excused_absent' then
    credits := 0;
    entry_type := null;
    no_debit_label := false;
    return next;
    return;
  end if;

  if public.is_match_session_kind(p_kind) then
    v_entry := 'match_debit';
  elsif p_attendance_status = 'unexcused_absent' then
    v_entry := 'no_show_debit';
  else
    v_entry := 'attend_debit';
  end if;

  if p_debit_override_n is not null then
    if p_debit_override_n < 0 then
      credits := 0;
      entry_type := null;
      no_debit_label := false;
      return next;
      return;
    end if;
    if p_debit_override_n = 0 then
      credits := 0;
      entry_type := null;
      no_debit_label := true;
      return next;
      return;
    end if;
    if public.is_match_session_kind(p_kind) and coalesce(p_already_debited_same_match_day, false) then
      credits := 0;
      entry_type := null;
      no_debit_label := false;
      return next;
      return;
    end if;
    credits := p_debit_override_n;
    entry_type := v_entry;
    no_debit_label := false;
    return next;
    return;
  end if;

  if p_kind = 'regular' then
    if p_attendance_status = 'present' then
      credits := 1;
      entry_type := v_entry;
      no_debit_label := false;
    else
      credits := 0;
      entry_type := null;
      no_debit_label := false;
    end if;
    return next;
    return;
  end if;

  if p_kind = 'special' then
    if p_attendance_status in ('present', 'unexcused_absent') then
      credits := 2;
      entry_type := v_entry;
      no_debit_label := false;
    else
      credits := 0;
      entry_type := null;
      no_debit_label := false;
    end if;
    return next;
    return;
  end if;

  if coalesce(p_already_debited_same_match_day, false) then
    credits := 0;
    entry_type := null;
    no_debit_label := false;
    return next;
    return;
  end if;

  if p_attendance_status in ('present', 'unexcused_absent') then
    credits := 1;
    entry_type := 'match_debit';
    no_debit_label := false;
  else
    credits := 0;
    entry_type := null;
    no_debit_label := false;
  end if;
  return next;
end;
$$;

comment on function public.compute_session_debit_plan(
  public.session_kind,
  public.age_band,
  public.attendance_status,
  boolean,
  integer,
  boolean,
  boolean
) is
  'Kind defaults: regular present −1, regular unexcused 0, regular excused 0; special present or unexcused −2, excused 0; cup/league/friendly −1 per competing player per Asia/Taipei calendar day. Admin override still wins. U6/reserve/adult/no_debit 0.';

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

  if not public.is_match_session_kind(v_kind) then
    raise exception 'match kind must be cup, league, or friendly' using errcode = '22023';
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

comment on function public.admin_update_match(uuid, text, timestamptz, timestamptz, text, text, text, public.match_side, boolean) is
  'Admin-only. Update cup/league/friendly title/times/venue and public opponent/side. Opponent may be cleared to TBD.';

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
    if not public.is_match_session_kind(v_kind) then
      raise exception 'match kind must be cup, league, or friendly' using errcode = '22023';
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

comment on function public.admin_set_match_published(uuid, boolean) is
  'Admin-only. Publish or unpublish a cup/league/friendly match. Unpublished stays hidden from /matches.';

comment on function public.admin_create_matches(uuid, text, public.session_kind, timestamptz[], timestamptz[], text, text, text, public.match_side, boolean, boolean) is
  'Admin-only bulk create. Loops admin_create_match (cup/league/friendly). Opponent may be null. Max 40.';
