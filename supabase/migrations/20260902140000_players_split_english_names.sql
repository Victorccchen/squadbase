-- Stage 2 follow-up (staging only). Do not run against production.
-- Player names: English given + family are both required; Traditional Chinese
-- and Japanese are optional, but at least one of the two must be present.
--
-- Existing name_en values are split on first whitespace:
--   * first token → name_en_given
--   * remainder → name_en_family
--   * single-token names keep the token as given and use '-' for family so
--     NOT NULL / not-blank checks succeed. Admins should edit those rows.
-- Re-runnable: skips the split if name_en is already gone.

alter table public.players
  add column if not exists name_en_given text,
  add column if not exists name_en_family text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'players'
      and column_name = 'name_en'
  ) then
    update public.players
    set
      name_en_given = coalesce(
        nullif(substring(btrim(name_en) from '^\S+'), ''),
        '-'
      ),
      name_en_family = coalesce(
        nullif(btrim(regexp_replace(btrim(name_en), '^\S+\s*', '')), ''),
        '-'
      );
  end if;
end
$$;

update public.players
set name_en_given = '-'
where name_en_given is null or char_length(btrim(name_en_given)) = 0;

update public.players
set name_en_family = '-'
where name_en_family is null or char_length(btrim(name_en_family)) = 0;

alter table public.players
  alter column name_en_given set not null,
  alter column name_en_family set not null;

alter table public.players drop constraint if exists players_name_en_not_blank;
alter table public.players drop constraint if exists players_name_zh_not_blank;
alter table public.players drop constraint if exists players_name_ja_not_blank;
alter table public.players drop constraint if exists players_name_en_given_not_blank;
alter table public.players drop constraint if exists players_name_en_family_not_blank;
alter table public.players drop constraint if exists players_name_zh_or_ja_present;

alter table public.players drop column if exists name_en;

alter table public.players
  alter column name_zh drop not null,
  alter column name_ja drop not null;

update public.players
set name_zh = null
where name_zh is not null and char_length(btrim(name_zh)) = 0;

update public.players
set name_ja = null
where name_ja is not null and char_length(btrim(name_ja)) = 0;

alter table public.players
  add constraint players_name_en_given_not_blank
    check (char_length(btrim(name_en_given)) > 0),
  add constraint players_name_en_family_not_blank
    check (char_length(btrim(name_en_family)) > 0),
  add constraint players_name_zh_not_blank
    check (name_zh is null or char_length(btrim(name_zh)) > 0),
  add constraint players_name_ja_not_blank
    check (name_ja is null or char_length(btrim(name_ja)) > 0),
  add constraint players_name_zh_or_ja_present
    check (
      (name_zh is not null and char_length(btrim(name_zh)) > 0)
      or
      (name_ja is not null and char_length(btrim(name_ja)) > 0)
    );
