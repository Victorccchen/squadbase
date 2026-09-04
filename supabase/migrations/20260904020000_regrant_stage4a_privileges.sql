-- Stage 4A follow-up (staging only). Do not run against production.
-- Idempotent privilege repair if admins see permission denied on
-- session_series, session_kind, or Stage 4A RPCs.
-- Does not change RLS policies. Safe to re-run.

revoke all on table public.session_series from public, anon;
revoke delete on table public.training_sessions from public, anon, authenticated;

grant select, insert, update on table public.training_sessions to authenticated;
grant select, insert, update on table public.session_series to authenticated;

grant usage on type public.session_kind to authenticated;
grant usage on type public.session_registration_status to authenticated;
grant usage on type public.session_message_author_role to authenticated;

revoke all on function public.guardian_can_read_session(uuid) from public, anon;
revoke all on function public.coach_can_read_session(uuid) from public, anon;
revoke all on function public.register_player_for_session(uuid, uuid, text) from public, anon;
revoke all on function public.cancel_session_registration(uuid) from public, anon;
revoke all on function public.switch_session_registration(uuid, uuid) from public, anon;
revoke all on function public.post_session_registration_message(uuid, text, public.session_message_author_role) from public, anon;
revoke all on function public.admin_create_session_series(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, public.org_status, date, integer) from public, anon;
revoke all on function public.admin_soft_delete_session(uuid) from public, anon;
revoke all on function public.admin_soft_delete_session_series(uuid) from public, anon;
revoke all on function public.admin_delete_team(uuid) from public, anon;

grant execute on function public.guardian_can_read_session(uuid) to authenticated;
grant execute on function public.coach_can_read_session(uuid) to authenticated;
grant execute on function public.register_player_for_session(uuid, uuid, text) to authenticated;
grant execute on function public.cancel_session_registration(uuid) to authenticated;
grant execute on function public.switch_session_registration(uuid, uuid) to authenticated;
grant execute on function public.post_session_registration_message(uuid, text, public.session_message_author_role) to authenticated;
grant execute on function public.admin_create_session_series(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, public.org_status, date, integer) to authenticated;
grant execute on function public.admin_soft_delete_session(uuid) to authenticated;
grant execute on function public.admin_soft_delete_session_series(uuid) to authenticated;
grant execute on function public.admin_delete_team(uuid) to authenticated;
