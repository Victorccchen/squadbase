-- Stage 4B follow-up (staging only). Do not run against production.
-- Idempotent privilege repair if parents/admins/coaches see permission denied
-- on credit tables or Stage 4B RPCs after the main 4B migration.
-- Does not change RLS policies. Safe to re-run.

grant usage on type public.package_age_band to authenticated;
grant usage on type public.payment_claim_status to authenticated;
grant usage on type public.attendance_status to authenticated;
grant usage on type public.credit_ledger_entry_type to authenticated;
grant usage on type public.leave_request_status to authenticated;

revoke all on table public.session_packages from public, anon;
revoke all on table public.player_session_balances from public, anon;
revoke all on table public.payment_claims from public, anon;
revoke all on table public.session_credit_ledger from public, anon;
revoke all on table public.session_attendance from public, anon;
revoke all on table public.session_leave_requests from public, anon;
revoke all on table public.club_runtime_settings from public, anon;

grant select, insert, update on table public.session_packages to authenticated;
grant select on table public.player_session_balances to authenticated;
grant select, insert, update on table public.payment_claims to authenticated;
grant select on table public.session_credit_ledger to authenticated;
grant select on table public.session_attendance to authenticated;
grant select, insert, update on table public.session_leave_requests to authenticated;
grant select, insert, update on table public.club_runtime_settings to authenticated;

grant select, update on table public.training_sessions to authenticated;

revoke all on function public.submit_payment_claim(uuid, uuid, text) from public, anon;
revoke all on function public.admin_review_payment_claim(uuid, public.payment_claim_status, text) from public, anon;
revoke all on function public.admin_adjust_session_credits(uuid, integer, text) from public, anon;
revoke all on function public.admin_upsert_session_package(uuid, public.package_age_band, integer, integer, boolean) from public, anon;
revoke all on function public.admin_set_session_debit_override(uuid, boolean, integer) from public, anon;
revoke all on function public.admin_set_club_setting(text, text) from public, anon;
revoke all on function public.request_excused_leave(uuid, text) from public, anon;
revoke all on function public.staff_review_leave_request(uuid, public.leave_request_status, text) from public, anon;
revoke all on function public.mark_session_attendance(uuid, uuid, public.attendance_status) from public, anon;
revoke all on function public.compute_session_debit_plan(public.session_kind, public.age_band, public.attendance_status, boolean, integer, boolean, boolean) from public, anon;
revoke all on function public.catalog_band_from_team_age_band(public.age_band) from public, anon;
revoke all on function public.credits_apply_to_age_band(public.age_band) from public, anon;

grant execute on function public.submit_payment_claim(uuid, uuid, text) to authenticated;
grant execute on function public.admin_review_payment_claim(uuid, public.payment_claim_status, text) to authenticated;
grant execute on function public.admin_adjust_session_credits(uuid, integer, text) to authenticated;
grant execute on function public.admin_upsert_session_package(uuid, public.package_age_band, integer, integer, boolean) to authenticated;
grant execute on function public.admin_set_session_debit_override(uuid, boolean, integer) to authenticated;
grant execute on function public.admin_set_club_setting(text, text) to authenticated;
grant execute on function public.request_excused_leave(uuid, text) to authenticated;
grant execute on function public.staff_review_leave_request(uuid, public.leave_request_status, text) to authenticated;
grant execute on function public.mark_session_attendance(uuid, uuid, public.attendance_status) to authenticated;
grant execute on function public.compute_session_debit_plan(public.session_kind, public.age_band, public.attendance_status, boolean, integer, boolean, boolean) to authenticated;
grant execute on function public.catalog_band_from_team_age_band(public.age_band) to authenticated;
grant execute on function public.credits_apply_to_age_band(public.age_band) to authenticated;
