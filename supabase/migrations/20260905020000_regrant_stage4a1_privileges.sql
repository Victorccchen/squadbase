-- Stage 4A.1 follow-up (staging only). Do not run against production.
-- Idempotent privilege repair if admins see permission denied on
-- session_series.weekdays or admin_create_session_series after the
-- 4A.1 signature change (added p_weekdays smallint[]).
-- Does not change RLS policies. Safe to re-run.

grant select, insert, update on table public.session_series to authenticated;
grant select, insert, update on table public.training_sessions to authenticated;
grant usage on type public.session_kind to authenticated;

revoke all on function public.admin_create_session_series(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, public.org_status, date, integer, smallint[]) from public, anon;
grant execute on function public.admin_create_session_series(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, public.org_status, date, integer, smallint[]) to authenticated;

revoke all on function public.admin_soft_delete_session(uuid) from public, anon;
revoke all on function public.admin_soft_delete_session_series(uuid) from public, anon;
grant execute on function public.admin_soft_delete_session(uuid) to authenticated;
grant execute on function public.admin_soft_delete_session_series(uuid) to authenticated;
