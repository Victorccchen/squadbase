-- Stage P verification (staging SQL Editor). Does not leave rows.
-- Do not run on production.
--
-- Asserts photo columns, RPCs, private bucket, and that the public match
-- roster function still returns name + jersey only (no photo_path).

begin;

do $$
declare
  v_def text;
  v_public boolean;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'players'
      and column_name = 'photo_path'
  ) then
    raise exception 'TP schema failed: players.photo_path missing';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'players'
      and column_name = 'photo_updated_at'
  ) then
    raise exception 'TP schema failed: players.photo_updated_at missing';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'players'
      and column_name = 'id_pdf_path'
  ) then
    raise exception 'TP schema failed: players.id_pdf_path missing';
  end if;

  if to_regprocedure('public.can_write_player_photo(uuid)') is null then
    raise exception 'TP schema failed: can_write_player_photo missing';
  end if;
  if to_regprocedure('public.can_read_player_photo(uuid)') is null then
    raise exception 'TP schema failed: can_read_player_photo missing';
  end if;
  if to_regprocedure('public.set_player_headshot(uuid, text)') is null then
    raise exception 'TP schema failed: set_player_headshot missing';
  end if;
  if to_regprocedure('public.set_player_id_pdf(uuid, text)') is null then
    raise exception 'TP schema failed: set_player_id_pdf missing';
  end if;

  if to_regprocedure('public.list_published_match_roster(uuid)') is null then
    raise exception 'TP schema failed: list_published_match_roster missing';
  end if;

  v_def := pg_get_functiondef('public.list_published_match_roster(uuid)'::regprocedure);
  if v_def ilike '%photo_path%' or v_def ilike '%id_pdf_path%' or v_def ilike '%photo_updated_at%' then
    raise exception 'TP leak: list_published_match_roster must not mention photo columns';
  end if;

  select public into v_public
  from storage.buckets
  where id = 'player-photos';
  if not found then
    raise exception 'TP schema failed: storage bucket player-photos missing';
  end if;
  if v_public is distinct from false then
    raise exception 'TP schema failed: player-photos must be private';
  end if;

  raise notice 'Stage P schema + public roster isolation ok';
end
$$;

rollback;

-- RLS notes (run as the relevant JWT, not as postgres):
-- TP-1: admin upload jpeg → players.photo_path set; signed URL works for admin.
-- TP-2: approved guardian upload on linked child OK; other player denied.
-- TP-3: exe / oversized image rejected by app (and bucket MIME/size).
-- TP-4: replace changes photo_path (new object name).
-- TP-5: anon list_published_match_roster has no photo_path / storage URL.
-- TP-6: players with photo_path is null appear in the missing-headshot filter.
-- TP-7: PDF upload sets id_pdf_path; image thumb still preferred.
