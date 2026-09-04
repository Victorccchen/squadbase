-- Ensure link_status includes revoked. Staging SQL Editor only.
-- Do not run against production.
--
-- Step 1 of 2 for the duplicate-link cleanup (PR that also contains
-- 20260907000000_dedupe_guardian_player_links.sql).
--
-- Staging that skipped the lifecycle enum file
-- (20260902200000_link_status_add_revoked.sql) will fail the cleanup
-- UPDATE with: invalid input value for enum link_status: "revoked".
--
-- PostgreSQL cannot ADD VALUE and USE the new enum in the same
-- transaction. Paste THIS FILE'S CONTENTS alone, Run, and wait for
-- success. Then paste 20260907000000_dedupe_guardian_player_links.sql
-- in a SEPARATE SQL Editor Run. Do not concatenate the two files.
--
-- Safe to re-run (IF NOT EXISTS). Same statement as
-- 20260902200000_link_status_add_revoked.sql; either file is enough
-- as step 1.

alter type public.link_status add value if not exists 'revoked';
