-- Staging verification for admin_soft_delete_match. Does not leave rows.
-- Do not run on production.
-- Paste this file's CONTENTS in the staging SQL Editor (not a path string).

begin;

do $$
begin
  if to_regprocedure('public.admin_soft_delete_match(uuid)') is null then
    raise exception 'admin_soft_delete_match missing';
  end if;
  if to_regprocedure('public.admin_soft_delete_session(uuid)') is null then
    raise exception 'admin_soft_delete_session missing';
  end if;
  raise notice 'admin_soft_delete_match schema ok';
end
$$;

rollback;

-- JWT notes (run as the relevant role in SQL Editor, not as postgres):
-- T-MATCH-DEL-1: admin JWT can call admin_soft_delete_match(session_id) on a
--   cup/league/friendly row with match_publications. deleted_at is set,
--   is_published becomes false, public_status is unchanged, match_roster and
--   session_registrations row counts stay the same. Calling again is a no-op.
-- T-MATCH-DEL-2: parent JWT calling admin_soft_delete_match raises not authorized.
-- T-MATCH-DEL-3: admin JWT on a regular/special session (no match_publications)
--   raises match not found. Cancel (admin_cancel_match) is a different RPC.
