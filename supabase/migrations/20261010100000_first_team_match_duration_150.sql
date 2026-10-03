-- First-team matches last 150 minutes by default (spec v4 §5.1, §8.1-7).
-- Staging only. Do not run against production.
--
-- The app now defaults senior/reserve matches to 150 minutes (90 + 15
-- half-time + 45 buffer for stoppage and delays) when the admin gives no end
-- time (lib/org/match.ts defaultMatchDurationMinutes). This backfills existing
-- first-team match sessions that are shorter, so the official site's live
-- window is not cut off during stoppage time. Youth matches keep 90 minutes
-- (check-in and credit rules are unchanged).
--
-- Only ends_at changes. Deleted sessions are left alone. Idempotent: a second
-- run finds nothing shorter than 150 minutes.

update public.training_sessions s
set ends_at = s.starts_at + interval '150 minutes'
from public.teams t
where t.id = s.team_id
  and t.age_band in ('senior', 'reserve')
  and public.is_match_session_kind(s.kind)
  and s.deleted_at is null
  and s.ends_at - s.starts_at < interval '150 minutes';
