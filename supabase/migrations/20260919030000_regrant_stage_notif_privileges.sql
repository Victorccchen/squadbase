-- Stage Notif privilege follow-up (staging only). Do not run against production.
-- Idempotent. Does not change RLS policies. Safe to re-run.
--
-- Paste this file's CONTENTS in the staging SQL Editor (not a path string)
-- if authenticated callers see permission denied on push_subscriptions or
-- notification_sends after the main Stage Notif migration.

revoke all on table public.push_subscriptions from public, anon;
revoke all on table public.notification_sends from public, anon;

grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant select, insert on table public.notification_sends to authenticated;
