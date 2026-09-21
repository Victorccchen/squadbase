-- STAGING ONLY. DO NOT RUN ON PRODUCTION.
--
-- Bulk soft-delete of Victory League series match shells for Futuro 隊伍,
-- using the same semantics as admin 「刪除此場比賽」:
--   * set training_sessions.deleted_at (keep existing timestamp if already set)
--   * unpublish match_publications (is_published = false)
--   * do NOT set public_status = cancelled (cancel is a different action)
--   * do NOT delete match_roster, session_registrations, or Q&A
-- Idempotent: already-deleted rows are skipped by the UPDATE ... WHERE deleted_at IS NULL.
--
-- Exact filter (all must hold):
--   1. training_sessions.kind IN ('cup', 'league', 'friendly')
--   2. a match_publications row exists for the session
--   3. teams.kind = 'competition_team'
--   4. teams.name ILIKE '%futuro%'  (Futuro U8 / FUTURO U10 / …)
--   5. title matches Victory League after lowercasing and folding fullwidth
--      parentheses: '（'→'(' and '）'→')'
--      Matches include:
--        'Victory League'
--        'Victory League 2026/27'
--        'Victory League 2026/27 (暫定)'
--        'Victory League 2026/27（暫定）'
--      Does NOT match training sessions (regular/special) or non-Futuro teams.
--
-- How to use (Supabase SQL Editor on the staging project only):
--   1. Paste and run PART A. Check count / titles / teams.
--   2. If the preview looks right, paste and run PART B (one transaction).
--   3. Re-run PART A. remaining_to_delete must be 0; already_deleted grows.
-- Paste file CONTENTS, not a path string. Do not apply this as a migration.

-- =============================================================================
-- PART A — preview (read-only)
-- =============================================================================

select
  s.id,
  s.title,
  s.kind,
  s.starts_at,
  t.name as team_name,
  t.kind as team_kind,
  p.is_published,
  p.public_status,
  s.deleted_at
from public.training_sessions s
join public.match_publications p on p.session_id = s.id
join public.teams t on t.id = s.team_id
where s.kind in ('cup', 'league', 'friendly')
  and t.kind = 'competition_team'
  and t.name ilike '%futuro%'
  and lower(replace(replace(s.title, '（', '('), '）', ')')) like '%victory league%'
order by t.name, s.starts_at, s.title;

select
  count(*) filter (where s.deleted_at is null) as remaining_to_delete,
  count(*) filter (where s.deleted_at is not null) as already_deleted,
  count(*) as matched_total
from public.training_sessions s
join public.match_publications p on p.session_id = s.id
join public.teams t on t.id = s.team_id
where s.kind in ('cup', 'league', 'friendly')
  and t.kind = 'competition_team'
  and t.name ilike '%futuro%'
  and lower(replace(replace(s.title, '（', '('), '）', ')')) like '%victory league%';

-- Diagnostic if PART A count is 0: list VL-ish titles without the Futuro/kind gates.
-- select s.id, s.title, s.kind, t.name, t.kind, s.deleted_at
-- from public.training_sessions s
-- left join public.teams t on t.id = s.team_id
-- where lower(replace(replace(s.title, '（', '('), '）', ')')) like '%victory%'
-- order by s.starts_at;

-- =============================================================================
-- PART B — apply (staging only). Run after PART A looks correct.
-- =============================================================================

begin;

update public.training_sessions s
set
  deleted_at = coalesce(s.deleted_at, now()),
  updated_by = coalesce(auth.uid(), s.updated_by)
where s.deleted_at is null
  and s.id in (
    select s2.id
    from public.training_sessions s2
    join public.match_publications p on p.session_id = s2.id
    join public.teams t on t.id = s2.team_id
    where s2.kind in ('cup', 'league', 'friendly')
      and t.kind = 'competition_team'
      and t.name ilike '%futuro%'
      and lower(replace(replace(s2.title, '（', '('), '）', ')')) like '%victory league%'
  );

update public.match_publications p
set
  is_published = false,
  updated_by = coalesce(auth.uid(), p.updated_by)
where p.is_published is distinct from false
  and p.session_id in (
    select s.id
    from public.training_sessions s
    join public.teams t on t.id = s.team_id
    where s.kind in ('cup', 'league', 'friendly')
      and t.kind = 'competition_team'
      and t.name ilike '%futuro%'
      and lower(replace(replace(s.title, '（', '('), '）', ')')) like '%victory league%'
      and s.deleted_at is not null
  );

-- Sanity: remaining_to_delete should be 0.
select
  count(*) filter (where s.deleted_at is null) as remaining_to_delete,
  count(*) filter (where s.deleted_at is not null) as already_deleted,
  count(*) as matched_total
from public.training_sessions s
join public.match_publications p on p.session_id = s.id
join public.teams t on t.id = s.team_id
where s.kind in ('cup', 'league', 'friendly')
  and t.kind = 'competition_team'
  and t.name ilike '%futuro%'
  and lower(replace(replace(s.title, '（', '('), '）', ')')) like '%victory league%';

commit;
