-- Stage 5C follow-up (staging only). Do not run against production.
-- Idempotent privilege repair if staff/parents see permission denied
-- on assessment_events / assessment_scores or Stage 5C RPCs after the
-- main Stage 5C migration. Does not change RLS policies. Safe to re-run.
--
-- Paste this file's CONTENTS in the staging SQL Editor (not a path string).

revoke all on table public.assessment_events from public, anon;
revoke all on table public.assessment_scores from public, anon;
grant select on table public.assessment_events to authenticated;
grant select on table public.assessment_scores to authenticated;

revoke all on function public.create_assessment_event(uuid, timestamptz, text, uuid, jsonb) from public, anon;
revoke all on function public.update_assessment_event(uuid, timestamptz, text, uuid, jsonb) from public, anon;
revoke all on function public.delete_assessment_event(uuid) from public, anon;
revoke all on function public.coach_can_assess_player(uuid) from public, anon;
revoke all on function public.staff_can_write_player_assessment(uuid) from public, anon;
revoke all on function public.can_read_player_assessment(uuid) from public, anon;

grant execute on function public.create_assessment_event(uuid, timestamptz, text, uuid, jsonb) to authenticated;
grant execute on function public.update_assessment_event(uuid, timestamptz, text, uuid, jsonb) to authenticated;
grant execute on function public.delete_assessment_event(uuid) to authenticated;
grant execute on function public.coach_can_assess_player(uuid) to authenticated;
grant execute on function public.staff_can_write_player_assessment(uuid) to authenticated;
grant execute on function public.can_read_player_assessment(uuid) to authenticated;
