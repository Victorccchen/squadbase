-- Stage 6P.1 step 1 (staging only). Do not run against production.
-- Adds session_kind.friendly (友誼賽). PostgreSQL cannot use a new enum
-- value in the same transaction that added it — paste this file alone,
-- wait for it to finish, then paste 20260909010000_stage6p1_friendly_matches.sql.
-- Idempotent. Safe to re-run.

alter type public.session_kind add value if not exists 'friendly';
