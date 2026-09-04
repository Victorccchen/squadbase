-- Dedup / unique open-link verification (staging SQL Editor only).
-- Do not run against production. Optional after
-- 20260907000000_dedupe_guardian_player_links.sql.
--
-- Victor: paste this file's CONTENTS (not the path) into the staging SQL Editor.
-- The unique-index block rolls back so staging data stays unchanged.
--
-- Expected:
--   * guardian_player_links_open_pair_idx exists
--   * a second pending/approved row for the same (guardian, player) fails
--   * leftover open duplicates should be 0 after the cleanup migration
--
-- After cleanup, extras are status = revoked with admin_note containing
-- 'deduped by migration' (not hard-deleted). Inspect with:
--
--   select id, guardian_user_id, player_id, status, admin_note, created_at
--   from public.guardian_player_links
--   where admin_note ilike '%deduped by migration%'
--   order by created_at desc;

-- Remaining open duplicates (expect 0 after the cleanup migration).
select
  guardian_user_id,
  player_id,
  count(*) as open_rows
from public.guardian_player_links
where status in ('pending', 'approved')
group by guardian_user_id, player_id
having count(*) > 1;

-- Unique index must exist.
do $$
begin
  if not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'guardian_player_links_open_pair_idx'
      and i.indisunique
  ) then
    raise exception 'guardian_player_links_open_pair_idx missing';
  end if;
  raise notice 'open-pair unique index present';
end
$$;

-- =============================================================================
-- Unique open-link constraint (rolls back).
-- Replace GUARDIAN_PROFILE_UUID with a real profiles.id.
-- =============================================================================

-- begin;
--
-- delete from public.team_memberships
-- where player_id in (
--   select id from public.players
--   where name_en_given = 'Dedupe' and name_en_family = 'Verify'
-- );
-- delete from public.guardian_player_links
-- where player_id in (
--   select id from public.players
--   where name_en_given = 'Dedupe' and name_en_family = 'Verify'
-- );
-- delete from public.players
-- where name_en_given = 'Dedupe' and name_en_family = 'Verify';
-- delete from public.teams where name = 'Dedupe Verify Team';
--
-- insert into public.teams (name, age_band, status)
-- values ('Dedupe Verify Team', 'U12', 'active');
--
-- insert into public.players (
--   name_zh, name_en_given, name_en_family, name_ja, birth_date, status
-- )
-- values ('驗證丁', 'Dedupe', 'Verify', null, '2014-08-15', 'active');
--
-- insert into public.team_memberships (player_id, team_id, jersey_number, status)
-- select p.id, t.id, 14, 'active'
-- from public.players p
-- join public.teams t on t.name = 'Dedupe Verify Team'
-- where p.name_en_given = 'Dedupe' and p.name_en_family = 'Verify';
--
-- insert into public.guardian_player_links (
--   guardian_user_id, player_id, relation, status
-- )
-- select 'GUARDIAN_PROFILE_UUID', p.id, 'parent', 'pending'
-- from public.players p
-- where p.name_en_given = 'Dedupe' and p.name_en_family = 'Verify';
--
-- do $$
-- begin
--   insert into public.guardian_player_links (
--     guardian_user_id, player_id, relation, status
--   )
--   select 'GUARDIAN_PROFILE_UUID', p.id, 'parent', 'pending'
--   from public.players p
--   where p.name_en_given = 'Dedupe' and p.name_en_family = 'Verify';
--   raise exception 'dedupe unique failed: second pending was accepted';
-- exception
--   when unique_violation then
--     raise notice 'dedupe unique passed: second pending rejected';
-- end
-- $$;
--
-- rollback;
