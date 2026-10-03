-- Public roster privacy fix (Futuro site spec v4 §8.1-6).
-- Staging only. Do not run against production.
--
-- list_published_match_roster is callable by anon and returned names and
-- jersey numbers for ANY published match, including U8–U12 youth matches.
-- From now on it returns rows only when both hold:
--   * the match's team is first team or reserve (teams.age_band in senior,
--     reserve), so youth match rosters are never public;
--   * the player is 18 or older on the match date (Asia/Taipei). Reserve
--     teams default to adult-only eligibility, but that can be overridden
--     and old rosters are not cleaned, so age is checked per player too.
--
-- The return columns are unchanged, so the existing public match page and
-- types keep working. Grants are restated explicitly.

create or replace function public.list_published_match_roster(p_session_id uuid)
returns table (
  player_id uuid,
  name_zh text,
  name_en_given text,
  name_en_family text,
  name_ja text,
  jersey_number integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.player_id,
    pl.name_zh,
    pl.name_en_given,
    pl.name_en_family,
    pl.name_ja,
    r.jersey_number
  from public.match_roster r
  join public.players pl on pl.id = r.player_id
  join public.training_sessions s on s.id = r.session_id
  join public.teams t on t.id = s.team_id
  where r.session_id = p_session_id
    and public.match_is_publicly_visible(p_session_id)
    and t.age_band in ('senior', 'reserve')
    and pl.birth_date <= ((s.starts_at at time zone 'Asia/Taipei')::date - interval '18 years')::date
  order by r.jersey_number asc, pl.name_en_family asc, pl.name_en_given asc;
$$;

comment on function public.list_published_match_roster(uuid) is
  'Anon-safe lineup: display-name columns + jersey only. Senior and reserve matches only; players under 18 on the match date (Asia/Taipei) are left out. No birth_date, phone, or credits.';

revoke all on function public.list_published_match_roster(uuid) from public;
grant execute on function public.list_published_match_roster(uuid) to anon, authenticated;
