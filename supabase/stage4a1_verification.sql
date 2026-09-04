-- Optional Stage 4A.1 checks. Staging only. Do not run against production.
-- Requires Stage 4A.1 migration. The unique-index block rolls back.
-- RPC generation checks need an admin JWT in SQL Editor.

begin;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'session_series'
      and column_name = 'weekdays'
  ) then
    raise exception 'session_series.weekdays missing';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_create_session_series'
      and pg_get_function_identity_arguments(p.oid)
        like '%smallint[]%'
  ) then
    raise exception 'admin_create_session_series p_weekdays argument missing';
  end if;

  raise notice 'Stage 4A.1 weekdays column and RPC signature ok';
end
$$;

rollback;

-- RPC notes (run as an admin JWT, not as postgres):
-- T4A1-1: regular, p_weekdays = ARRAY[2,4], p_week_count = 4
--   → 8 occurrences (4 Tue + 4 Thu), same series_id and title.
-- T4A1-2: regular, p_weekdays = ARRAY[3], p_until_date set
--   → every Wednesday in [start, until].
-- T4A1-5: special still inserts exactly one training_sessions row
--   even if p_weekdays is supplied.
-- Parent JWT must still fail admin_create_session_series (not authorized).
