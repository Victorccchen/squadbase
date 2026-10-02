-- Phase 1 PR-06 (P06-7): compute_session_debit_plan matches the TypeScript
-- debit table. Both read lib/credits/debit-rules.fixtures.json.
-- Run with psql from the repository root (scripts/db-verify.sh does); the SQL
-- Editor cannot load the fixture file. Read-only; rolls back.

\set fixture `cat lib/credits/debit-rules.fixtures.json`

begin;

select set_config('pr06.debit_fixture', :'fixture', true);

do $$
declare
  v_case jsonb;
  v_in jsonb;
  v_exp jsonb;
  v_plan record;
  v_failures text := '';
  v_count integer := 0;
begin
  for v_case in
    select jsonb_array_elements(current_setting('pr06.debit_fixture')::jsonb -> 'cases')
  loop
    v_in := v_case -> 'input';
    v_exp := v_case -> 'expected';
    select * into v_plan
    from public.compute_session_debit_plan(
      (v_in ->> 'kind')::public.session_kind,
      (v_in ->> 'teamAgeBand')::public.age_band,
      (v_in ->> 'attendanceStatus')::public.attendance_status,
      (v_in ->> 'noDebit')::boolean,
      (v_in ->> 'debitOverrideN')::integer,
      (v_in ->> 'excusedLeaveApproved')::boolean,
      (v_in ->> 'alreadyDebitedSameMatchDay')::boolean
    );
    if v_plan.credits is distinct from (v_exp ->> 'credits')::integer
       or v_plan.entry_type::text is distinct from (v_exp ->> 'entryType')
       or v_plan.no_debit_label is distinct from (v_exp ->> 'noDebitLabel')::boolean then
      v_failures := v_failures || format(E'\n  %s: got %s/%s/%s, expected %s/%s/%s',
        v_case ->> 'name', v_plan.credits, v_plan.entry_type, v_plan.no_debit_label,
        v_exp ->> 'credits', coalesce(v_exp ->> 'entryType', 'null'), v_exp ->> 'noDebitLabel');
    end if;
    v_count := v_count + 1;
  end loop;

  if v_count < 15 then
    raise exception 'debit fixture not loaded (% cases)', v_count;
  end if;
  if v_failures <> '' then
    raise exception 'SQL debit table differs from the fixture:%', v_failures;
  end if;
  raise notice 'debit_rules_fixture_verification: % cases match', v_count;
end;
$$;

rollback;
