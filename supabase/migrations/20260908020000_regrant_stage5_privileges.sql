-- Stage 5 follow-up (staging only). Do not run against production.
-- Idempotent privilege repair if staff/parents see permission denied
-- on player_assessments or Stage 5 RPCs after the main Stage 5 migration.
-- Does not change RLS policies. Safe to re-run.
--
-- Paste this file's CONTENTS in the staging SQL Editor (not a path string).

revoke all on table public.player_assessments from public, anon;
grant select on table public.player_assessments to authenticated;

revoke all on function public.coach_can_assess_player(uuid) from public, anon;
revoke all on function public.staff_can_write_player_assessment(uuid) from public, anon;
revoke all on function public.can_read_player_assessment(uuid) from public, anon;
revoke all on function public.create_player_assessment(uuid, date, jsonb, jsonb) from public, anon;
revoke all on function public.update_player_assessment(uuid, date, jsonb, jsonb) from public, anon;
revoke all on function public.delete_player_assessment(uuid) from public, anon;

grant execute on function public.coach_can_assess_player(uuid) to authenticated;
grant execute on function public.staff_can_write_player_assessment(uuid) to authenticated;
grant execute on function public.can_read_player_assessment(uuid) to authenticated;
grant execute on function public.create_player_assessment(uuid, date, jsonb, jsonb) to authenticated;
grant execute on function public.update_player_assessment(uuid, date, jsonb, jsonb) to authenticated;
grant execute on function public.delete_player_assessment(uuid) to authenticated;
