-- Stage 4A.1: multi-select ISO weekdays on recurring series.
-- Apply to the staging project only. Do not run against production.
--
-- Extends Stage 4A. Does not change auto-approve registration, capacity, notes, or Q&A.
-- Does not add payments, prepaid packages, attendance deduction, LINE, or push (Stage 4B).
--
-- Encoding: session_series.weekdays is smallint[] using ISO-8601
--   1=Monday … 7=Sunday.
-- Recurring kinds (regular/cup/league) require at least one weekday.
-- special remains exactly one occurrence (weekdays ignored / stored null).
--
-- Week-count N = N occurrences per selected weekday, including the first of
-- that weekday on or after the series start date. Total = sum across
-- weekdays, max 52 (reject the entire create if over).
-- Until-date: every calendar date in [startDate, untilDate] whose weekday
-- is selected, at the chosen Asia/Taipei time of day.
--
-- Backward compatible: p_weekdays NULL infers a one-element array from
-- p_starts_at's Taipei weekday (Stage 4A single-weekday callers).

alter table public.session_series
  add column if not exists weekdays smallint[];

alter table public.session_series
  drop constraint if exists session_series_weekdays_iso;
alter table public.session_series
  add constraint session_series_weekdays_iso
  check (
    weekdays is null
    or (
      cardinality(weekdays) between 1 and 7
      and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    )
  );

comment on column public.session_series.weekdays is
  'ISO-8601 weekdays 1=Monday … 7=Sunday. Null for special or legacy series. Recurring series persist the selected weekdays.';

drop function if exists public.admin_create_session_series(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, public.org_status, date, integer);
drop function if exists public.admin_create_session_series(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, public.org_status, date, integer, smallint[]);

create or replace function public.admin_create_session_series(
  p_team_id uuid,
  p_title text,
  p_kind public.session_kind,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location text default null,
  p_notes text default null,
  p_status public.org_status default 'active',
  p_until_date date default null,
  p_week_count integer default null,
  p_weekdays smallint[] default null
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
  v_status public.org_status;
  v_series_id uuid;
  v_first_date date;
  v_start_local time;
  v_duration interval;
  v_weekdays smallint[];
  v_dates date[] := '{}';
  v_date date;
  v_dow integer;
  v_delta integer;
  v_occ_start timestamptz;
  v_occ_end timestamptz;
  v_i integer;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_title := btrim(coalesce(p_title, ''));
  if char_length(v_title) < 1 then
    raise exception 'title required' using errcode = '22023';
  end if;
  v_title := left(v_title, 200);

  if p_kind is null then
    raise exception 'invalid session kind' using errcode = '22023';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'end time must be after start time' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.teams where id = p_team_id) then
    raise exception 'team not found' using errcode = 'P0002';
  end if;

  v_location := nullif(btrim(coalesce(p_location, '')), '');
  if v_location is not null then
    v_location := left(v_location, 200);
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null then
    v_notes := left(v_notes, 1000);
  end if;

  v_status := coalesce(p_status, 'active');
  v_first_date := (p_starts_at at time zone 'Asia/Taipei')::date;
  v_start_local := (p_starts_at at time zone 'Asia/Taipei')::time;
  v_duration := p_ends_at - p_starts_at;

  if p_kind = 'special' then
    v_weekdays := null;
    v_dates := array[v_first_date];
  else
    if p_until_date is not null and p_week_count is not null then
      raise exception 'recurrence cannot use both end date and week count' using errcode = '22023';
    end if;
    if p_until_date is null and p_week_count is null then
      raise exception 'recurrence requires an end date or a week count' using errcode = '22023';
    end if;

    if p_weekdays is null then
      v_weekdays := array[extract(isodow from v_first_date)::smallint];
    else
      if exists (
        select 1
        from unnest(p_weekdays) as w(d)
        where w.d is null or w.d < 1 or w.d > 7
      ) then
        raise exception 'invalid weekdays' using errcode = '22023';
      end if;
      if cardinality(p_weekdays) < 1 then
        raise exception 'weekdays required' using errcode = '22023';
      end if;
      select array_agg(d order by d)
        into v_weekdays
      from (select distinct unnest(p_weekdays)::smallint as d) s;
      if v_weekdays is null or cardinality(v_weekdays) < 1 then
        raise exception 'weekdays required' using errcode = '22023';
      end if;
    end if;

    if p_week_count is not null then
      if p_week_count < 1 or p_week_count > 52 then
        raise exception 'invalid week count' using errcode = '22023';
      end if;
      if p_week_count * cardinality(v_weekdays) > 52 then
        raise exception 'too many occurrences' using errcode = 'P0001';
      end if;

      foreach v_dow in array v_weekdays loop
        v_delta := (v_dow - extract(isodow from v_first_date)::integer + 7) % 7;
        v_date := v_first_date + v_delta;
        for v_i in 0 .. p_week_count - 1 loop
          v_dates := array_append(v_dates, v_date + (v_i * 7));
        end loop;
      end loop;
    else
      if p_until_date < v_first_date then
        raise exception 'until date is before the first start' using errcode = '22023';
      end if;

      v_date := v_first_date;
      while v_date <= p_until_date loop
        if extract(isodow from v_date)::integer = any (v_weekdays::integer[]) then
          v_dates := array_append(v_dates, v_date);
          if cardinality(v_dates) > 52 then
            raise exception 'too many occurrences' using errcode = 'P0001';
          end if;
        end if;
        v_date := v_date + 1;
      end loop;

      if cardinality(v_dates) < 1 then
        raise exception 'until date is before the first start' using errcode = '22023';
      end if;
    end if;
  end if;

  select coalesce(array_agg(d order by d), '{}')
    into v_dates
  from unnest(v_dates) as d;

  insert into public.session_series (
    team_id,
    title,
    kind,
    location,
    notes,
    status,
    weekdays,
    created_by,
    updated_by
  )
  values (
    p_team_id,
    v_title,
    p_kind,
    v_location,
    v_notes,
    v_status,
    v_weekdays,
    auth.uid(),
    auth.uid()
  )
  returning id into v_series_id;

  foreach v_date in array v_dates loop
    if v_date = v_first_date then
      v_occ_start := p_starts_at;
      v_occ_end := p_ends_at;
    else
      v_occ_start := timezone('Asia/Taipei', (v_date + v_start_local)::timestamp);
      v_occ_end := v_occ_start + v_duration;
    end if;

    insert into public.training_sessions (
      team_id,
      title,
      kind,
      series_id,
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
      v_series_id,
      v_occ_start,
      v_occ_end,
      v_location,
      v_notes,
      v_status,
      false,
      auth.uid(),
      auth.uid()
    );
  end loop;

  return v_series_id;
end;
$$;

comment on function public.admin_create_session_series(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, public.org_status, date, integer, smallint[]) is
  'Admin-only. Creates a series and occurrences. p_weekdays is ISO 1=Mon … 7=Sun; NULL infers the starts_at weekday. special = 1 occurrence. Recurring: end date XOR week count; N is per weekday including the first of that weekday; max 52 total. Does not generate playoff brackets.';

revoke all on function public.admin_create_session_series(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, public.org_status, date, integer, smallint[]) from public, anon;
grant execute on function public.admin_create_session_series(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, public.org_status, date, integer, smallint[]) to authenticated;

grant select, insert, update on table public.session_series to authenticated;
grant usage on type public.session_kind to authenticated;
