-- Stage 5B follow-up (staging only). Do not run against production.
-- Idempotent privilege repair if anon/admins see permission denied on
-- public match RPCs or match_publications after the main 5B migration.
-- Does not change RLS policies. Safe to re-run.

grant usage on type public.match_side to anon, authenticated;
grant usage on type public.match_public_status to anon, authenticated;
grant usage on type public.session_kind to anon, authenticated;

revoke all on table public.match_publications from public, anon;
revoke all on table public.match_roster from public, anon;

grant select, insert, update, delete on table public.match_publications to authenticated;
grant select, insert, update, delete on table public.match_roster to authenticated;

revoke all on function public.match_is_publicly_visible(uuid) from public, anon, authenticated;
revoke all on function public.list_published_matches() from public;
revoke all on function public.get_published_match(uuid) from public;
revoke all on function public.list_published_match_roster(uuid) from public;
revoke all on function public.admin_create_match(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, text, public.match_side, boolean, boolean) from public, anon;
revoke all on function public.admin_upsert_match_publication(uuid, text, public.match_side, boolean) from public, anon;
revoke all on function public.admin_update_match(uuid, text, timestamptz, timestamptz, text, text, text, public.match_side, boolean) from public, anon;
revoke all on function public.admin_set_match_published(uuid, boolean) from public, anon;
revoke all on function public.admin_set_match_result(uuid, integer, integer, text) from public, anon;
revoke all on function public.admin_cancel_match(uuid) from public, anon;
revoke all on function public.admin_restore_match(uuid) from public, anon;
revoke all on function public.admin_set_match_roster(uuid, uuid[]) from public, anon;

grant execute on function public.list_published_matches() to anon, authenticated;
grant execute on function public.get_published_match(uuid) to anon, authenticated;
grant execute on function public.list_published_match_roster(uuid) to anon, authenticated;
grant execute on function public.admin_create_match(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, text, public.match_side, boolean, boolean) to authenticated;
grant execute on function public.admin_upsert_match_publication(uuid, text, public.match_side, boolean) to authenticated;
grant execute on function public.admin_update_match(uuid, text, timestamptz, timestamptz, text, text, text, public.match_side, boolean) to authenticated;
grant execute on function public.admin_set_match_published(uuid, boolean) to authenticated;
grant execute on function public.admin_set_match_result(uuid, integer, integer, text) to authenticated;
grant execute on function public.admin_cancel_match(uuid) to authenticated;
grant execute on function public.admin_restore_match(uuid) to authenticated;
grant execute on function public.admin_set_match_roster(uuid, uuid[]) to authenticated;
