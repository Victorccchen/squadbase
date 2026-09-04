-- Stage 4B verification (staging SQL Editor). Substitute real UUIDs.
-- Rolls back so it does not leave rows. Do not run on production.

begin;

do $$
declare
  v_credits integer;
  v_entry public.credit_ledger_entry_type;
  v_label boolean;
begin
  -- C2 regular present = 1
  select credits, entry_type, no_debit_label
    into v_credits, v_entry, v_label
  from public.compute_session_debit_plan('regular', 'U8', 'present', false, null, false, false);
  if v_credits is distinct from 1 or v_entry is distinct from 'attend_debit' then
    raise exception 'C2 failed: regular present should debit 1';
  end if;

  -- C2 balance 0 blocks present is enforced in mark_session_attendance (insufficient credits).

  -- C3 special unexcused = 2; excused leave = 0
  select credits, entry_type
    into v_credits, v_entry
  from public.compute_session_debit_plan('special', 'U12', 'unexcused_absent', false, null, false, false);
  if v_credits is distinct from 2 or v_entry is distinct from 'no_show_debit' then
    raise exception 'C3 failed: special unexcused should debit 2';
  end if;

  select credits into v_credits
  from public.compute_session_debit_plan('special', 'U12', 'present', false, null, true, false);
  if v_credits is distinct from 0 then
    raise exception 'C3 failed: excused leave should debit 0';
  end if;

  -- C4 cup/league competing = 1/day
  select credits, entry_type
    into v_credits, v_entry
  from public.compute_session_debit_plan('cup', 'U15', 'present', false, null, false, false);
  if v_credits is distinct from 1 or v_entry is distinct from 'match_debit' then
    raise exception 'C4 failed: cup present should debit 1';
  end if;

  select credits into v_credits
  from public.compute_session_debit_plan('league', 'U18', 'present', false, null, false, true);
  if v_credits is distinct from 0 then
    raise exception 'C4 failed: same-day match should not double debit';
  end if;

  -- C5 reserve / adult / U6 = 0 (不扣堂)
  select credits, no_debit_label into v_credits, v_label
  from public.compute_session_debit_plan('regular', 'reserve', 'present', false, null, false, false);
  if v_credits is distinct from 0 or v_label is not true then
    raise exception 'C5 failed: reserve should not debit';
  end if;

  select credits into v_credits
  from public.compute_session_debit_plan('regular', 'senior', 'present', false, null, false, false);
  if v_credits is distinct from 0 then
    raise exception 'C5 failed: senior should not debit';
  end if;

  select credits into v_credits
  from public.compute_session_debit_plan('regular', 'U6', 'present', false, null, false, false);
  if v_credits is distinct from 0 then
    raise exception 'C5 failed: U6 should not debit';
  end if;
end
$$;

-- C7: non-admin cannot approve claims (function raises not authorized).
-- Run as a parent JWT in a separate session:
--   select public.admin_review_payment_claim('<claim-uuid>', 'approved', null);
-- Expect: not authorized. Parent UPDATE of status to approved affects 0 rows (no RLS policy).

rollback;
