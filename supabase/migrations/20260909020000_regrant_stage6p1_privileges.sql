-- Stage 6P.1 follow-up (staging only). Do not run against production.
-- Idempotent privilege repair after friendly match RPC replacements.
-- Does not change RLS policies. Safe to re-run.

grant usage on type public.session_kind to anon, authenticated;

revoke all on function public.is_match_session_kind(public.session_kind) from public, anon;
revoke all on function public.match_is_publicly_visible(uuid) from public, anon, authenticated;
revoke all on function public.list_published_matches() from public;
revoke all on function public.get_published_match(uuid) from public;
revoke all on function public.list_published_match_roster(uuid) from public;
revoke all on function public.admin_create_match(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, text, public.match_side, boolean, boolean) from public, anon;
revoke all on function public.admin_upsert_match_publication(uuid, text, public.match_side, boolean) from public, anon;
revoke all on function public.admin_update_match(uuid, text, timestamptz, timestamptz, text, text, text, public.match_side, boolean) from public, anon;
revoke all on function public.admin_set_match_published(uuid, boolean) from public, anon;
revoke all on function public.admin_create_matches(uuid, text, public.session_kind, timestamptz[], timestamptz[], text, text, text, public.match_side, boolean, boolean) from public, anon;
revoke all on function public.compute_session_debit_plan(public.session_kind, public.age_band, public.attendance_status, boolean, integer, boolean, boolean) from public, anon;

grant execute on function public.is_match_session_kind(public.session_kind) to authenticated;
grant execute on function public.list_published_matches() to anon, authenticated;
grant execute on function public.get_published_match(uuid) to anon, authenticated;
grant execute on function public.list_published_match_roster(uuid) to anon, authenticated;
grant execute on function public.admin_create_match(uuid, text, public.session_kind, timestamptz, timestamptz, text, text, text, public.match_side, boolean, boolean) to authenticated;
grant execute on function public.admin_upsert_match_publication(uuid, text, public.match_side, boolean) to authenticated;
grant execute on function public.admin_update_match(uuid, text, timestamptz, timestamptz, text, text, text, public.match_side, boolean) to authenticated;
grant execute on function public.admin_set_match_published(uuid, boolean) to authenticated;
grant execute on function public.admin_create_matches(uuid, text, public.session_kind, timestamptz[], timestamptz[], text, text, text, public.match_side, boolean, boolean) to authenticated;
grant execute on function public.compute_session_debit_plan(public.session_kind, public.age_band, public.attendance_status, boolean, integer, boolean, boolean) to authenticated;
