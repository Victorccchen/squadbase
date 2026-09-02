-- Lifecycle follow-up (staging only). Do not run against production.
-- Step 1 of 2: add link_status = revoked.
--
-- PostgreSQL cannot use a newly added enum value in the same transaction
-- that added it. Run this file in SQL Editor and wait for it to finish
-- before pasting 20260902220000_lifecycle_revoke_and_team_delete.sql.
-- Safe to re-run (IF NOT EXISTS).

alter type public.link_status add value if not exists 'revoked';
