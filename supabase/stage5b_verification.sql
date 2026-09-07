-- Stage 5B verification (staging SQL Editor). Does not leave rows.
-- Do not run on production.
--
-- Asserts tables/RPCs exist and that Stage 4B cup/league debit is unchanged.

begin;

do $$
declare
  v_credits integer;
  v_entry public.credit_ledger_entry_type;
begin
  if to_regclass('public.match_publications') is null then
    raise exception 'T5B schema failed: match_publications missing';
  end if;
  if to_regclass('public.match_roster') is null then
    raise exception 'T5B schema failed: match_roster missing';
  end if;

  if to_regprocedure('public.list_published_matches()') is null then
    raise exception 'T5B schema failed: list_published_matches missing';
  end if;
  if to_regprocedure('public.get_published_match(uuid)') is null then
    raise exception 'T5B schema failed: get_published_match missing';
  end if;
  if to_regprocedure('public.list_published_match_roster(uuid)') is null then
    raise exception 'T5B schema failed: list_published_match_roster missing';
  end if;
  if to_regprocedure(
    'public.admin_create_match(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, text, public.match_side, boolean, boolean)'
  ) is null then
    raise exception 'T5B schema failed: admin_create_match missing';
  end if;
  if to_regprocedure('public.admin_set_match_roster(uuid, uuid[])') is null then
    raise exception 'T5B schema failed: admin_set_match_roster missing';
  end if;

  -- Stage 4B C4 must still hold after Stage 5B (debit rules untouched).
  select credits, entry_type
    into v_credits, v_entry
  from public.compute_session_debit_plan('cup', 'U15', 'present', false, null, false, false);
  if v_credits is distinct from 1 or v_entry is distinct from 'match_debit' then
    raise exception 'T5B debit regression: cup present should still debit 1';
  end if;

  select credits into v_credits
  from public.compute_session_debit_plan('league', 'U18', 'present', false, null, false, true);
  if v_credits is distinct from 0 then
    raise exception 'T5B debit regression: same-day match should not double debit';
  end if;

  raise notice 'Stage 5B schema + debit C4 ok';
end
$$;

rollback;

-- RLS / RPC notes (run as the relevant JWT in SQL Editor, not as postgres):
-- T5B-1: admin_create_match(..., p_is_published := true) then
--   list_published_matches() as anon includes that id.
-- T5B-2: unpublished match is absent from list_published_matches() as anon
--   (and get_published_match returns 0 rows).
-- T5B-3: list_published_match_roster columns are name_* + jersey_number only
--   (no birth_date, phone, credits, last5).
-- T5B-4: admin_set_match_result then get_published_match shows scores.
-- T5B-5: admin_cancel_match then anon list omits the row (not listed).
-- T5B-7: parent JWT cannot call admin_create_match (not authorized).
