-- Stage 4 follow-up (staging only). Do not run against production.
-- Idempotent privilege repair if parents/admins see permission denied on
-- training_sessions, session_registrations, or Stage 4 RPCs.
-- Does not change RLS policies. Safe to re-run.

revoke all on table public.training_sessions from public, anon;
revoke all on table public.session_registrations from public, anon;
revoke all on table public.session_registration_messages from public, anon;

grant select, insert, update, delete on table public.training_sessions to authenticated;
grant select, insert, update, delete on table public.session_registrations to authenticated;
grant select, insert, update, delete on table public.session_registration_messages to authenticated;

grant usage on type public.session_registration_status to authenticated;
grant usage on type public.session_message_author_role to authenticated;

revoke all on function public.guardian_can_read_session(uuid) from public, anon;
revoke all on function public.coach_can_read_session(uuid) from public, anon;
revoke all on function public.register_player_for_session(uuid, uuid, text) from public, anon;
revoke all on function public.cancel_session_registration(uuid) from public, anon;
revoke all on function public.switch_session_registration(uuid, uuid) from public, anon;
revoke all on function public.post_session_registration_message(uuid, text, public.session_message_author_role) from public, anon;

grant execute on function public.guardian_can_read_session(uuid) to authenticated;
grant execute on function public.coach_can_read_session(uuid) to authenticated;
grant execute on function public.register_player_for_session(uuid, uuid, text) to authenticated;
grant execute on function public.cancel_session_registration(uuid) to authenticated;
grant execute on function public.switch_session_registration(uuid, uuid) to authenticated;
grant execute on function public.post_session_registration_message(uuid, text, public.session_message_author_role) to authenticated;
