-- Stage P privilege follow-up (staging only). Do not run against production.
-- Idempotent. Does not change RLS policies. Safe to re-run.
--
-- Paste this file's CONTENTS in the staging SQL Editor (not a path string)
-- if authenticated callers see permission denied on photo RPCs after the
-- main Stage P migration.

revoke all on function public.player_id_from_storage_name(text) from public, anon;
revoke all on function public.can_write_player_photo(uuid) from public, anon;
revoke all on function public.can_read_player_photo(uuid) from public, anon;
revoke all on function public.set_player_headshot(uuid, text) from public, anon;
revoke all on function public.set_player_id_pdf(uuid, text) from public, anon;

grant execute on function public.player_id_from_storage_name(text) to authenticated;
grant execute on function public.can_write_player_photo(uuid) to authenticated;
grant execute on function public.can_read_player_photo(uuid) to authenticated;
grant execute on function public.set_player_headshot(uuid, text) to authenticated;
grant execute on function public.set_player_id_pdf(uuid, text) to authenticated;
