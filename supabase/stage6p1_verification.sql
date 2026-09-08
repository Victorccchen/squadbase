-- Stage 6P.1 verification (staging SQL Editor). Does not leave rows.
-- Do not run on production.
-- Paste after both 6P.1 migrations (enum ADD VALUE, then friendly matches).

begin;

do $$
declare
  v_credits integer;
  v_entry public.credit_ledger_entry_type;
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'session_kind'
      and e.enumlabel = 'friendly'
  ) then
    raise exception 'T6P1 schema failed: session_kind.friendly missing';
  end if;

  if to_regprocedure('public.is_match_session_kind(public.session_kind)') is null then
    raise exception 'T6P1 schema failed: is_match_session_kind missing';
  end if;

  if not public.is_match_session_kind('friendly') then
    raise exception 'T6P1 schema failed: friendly should be a match kind';
  end if;
  if public.is_match_session_kind('regular') then
    raise exception 'T6P1 schema failed: regular should not be a match kind';
  end if;

  select credits, entry_type
    into v_credits, v_entry
  from public.compute_session_debit_plan('friendly', 'U15', 'present', false, null, false, false);
  if v_credits is distinct from 1 or v_entry is distinct from 'match_debit' then
    raise exception 'T6P1 debit failed: friendly present should debit 1 match_debit';
  end if;

  select credits into v_credits
  from public.compute_session_debit_plan('friendly', 'U18', 'present', false, null, false, true);
  if v_credits is distinct from 0 then
    raise exception 'T6P1 debit failed: same-day friendly should not double debit';
  end if;

  select credits, entry_type
    into v_credits, v_entry
  from public.compute_session_debit_plan('cup', 'U15', 'present', false, null, false, false);
  if v_credits is distinct from 1 or v_entry is distinct from 'match_debit' then
    raise exception 'T6P1 debit regression: cup present should still debit 1';
  end if;

  raise notice 'Stage 6P.1 friendly enum + debit C4 ok';
end
$$;

rollback;
