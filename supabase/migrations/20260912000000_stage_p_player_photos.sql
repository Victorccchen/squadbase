-- Stage P: player headshots / ID photos bound to players (staging only).
-- Do not run against production.
--
-- One current image per player (photo_path + photo_updated_at) plus an optional
-- league-submission PDF (id_pdf_path). Files live in a PRIVATE Storage bucket
-- `player-photos`. Public match RPCs are unchanged and must not gain these
-- columns.
--
-- Who can write (upload / replace / delete): admin, or an approved linked
-- guardian for that player. Assigned coaches may READ (signed URL) only.
--
-- Apply path (Raw SQL Editor, staging project only):
--   1. Paste THIS FILE's CONTENTS (not a path string) and run.
--   2. If execute/grants look missing, also paste
--      20260912010000_regrant_stage_p_privileges.sql.
--   3. Dashboard → Storage: confirm bucket `player-photos` exists and is
--      **private** (Public = off). allowed MIME: image/jpeg, image/png,
--      image/webp, application/pdf. File size limit 8 MB (PDF); the app
--      still rejects images over 5 MB.
--   4. If the Storage UI was used to create the bucket first, re-run this
--      file — bucket upsert and policies are idempotent.
--
-- Idempotent. Safe to re-run.

alter table public.players
  add column if not exists photo_path text,
  add column if not exists photo_updated_at timestamptz,
  add column if not exists id_pdf_path text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_photo_path_not_blank'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_photo_path_not_blank
      check (photo_path is null or char_length(trim(photo_path)) > 0);
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_id_pdf_path_not_blank'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_id_pdf_path_not_blank
      check (id_pdf_path is null or char_length(trim(id_pdf_path)) > 0);
  end if;
end
$$;

create index if not exists players_missing_photo_idx
  on public.players (id)
  where photo_path is null;

comment on column public.players.photo_path is
  'Private Storage object path in bucket player-photos (current headshot). Never a public URL.';
comment on column public.players.photo_updated_at is
  'When photo_path last changed. Null when there is no current headshot.';
comment on column public.players.id_pdf_path is
  'Optional private Storage object path for a league ID PDF. Independent of the headshot.';

create or replace function public.player_id_from_storage_name(object_name text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(coalesce(object_name, ''), '/', 1)
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(object_name, '/', 1)::uuid
    else null
  end;
$$;

create or replace function public.can_write_player_photo(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_player_id is not null and (
    public.has_role('admin')
    or public.is_approved_guardian_for_player(p_player_id)
  );
$$;

create or replace function public.can_read_player_photo(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_player_id is not null and (
    public.has_role('admin')
    or public.is_approved_guardian_for_player(p_player_id)
    or public.coach_can_read_player(p_player_id)
  );
$$;

create or replace function public.set_player_headshot(
  p_player_id uuid,
  p_photo_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
begin
  if auth.uid() is null or not public.can_write_player_photo(p_player_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'player not found' using errcode = 'P0002';
  end if;

  v_path := nullif(btrim(coalesce(p_photo_path, '')), '');
  if v_path is not null
     and public.player_id_from_storage_name(v_path) is distinct from p_player_id then
    raise exception 'invalid photo path' using errcode = '22023';
  end if;

  update public.players
    set photo_path = v_path,
        photo_updated_at = case when v_path is null then null else now() end,
        updated_by = auth.uid()
    where id = p_player_id;
end;
$$;

create or replace function public.set_player_id_pdf(
  p_player_id uuid,
  p_id_pdf_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
begin
  if auth.uid() is null or not public.can_write_player_photo(p_player_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'player not found' using errcode = 'P0002';
  end if;

  v_path := nullif(btrim(coalesce(p_id_pdf_path, '')), '');
  if v_path is not null
     and public.player_id_from_storage_name(v_path) is distinct from p_player_id then
    raise exception 'invalid photo path' using errcode = '22023';
  end if;

  update public.players
    set id_pdf_path = v_path,
        updated_by = auth.uid()
    where id = p_player_id;
end;
$$;

comment on function public.can_write_player_photo(uuid) is
  'Admin or approved guardian for this player. Coaches are false (view-only).';
comment on function public.can_read_player_photo(uuid) is
  'Admin, approved guardian, or assigned coach for a team the player is on.';
comment on function public.set_player_headshot(uuid, text) is
  'Writes players.photo_path / photo_updated_at only. Path must be under {player_id}/. Null clears.';
comment on function public.set_player_id_pdf(uuid, text) is
  'Writes players.id_pdf_path only. Path must be under {player_id}/. Null clears.';

revoke all on function public.player_id_from_storage_name(text) from public, anon;
revoke all on function public.can_write_player_photo(uuid) from public, anon;
revoke all on function public.can_read_player_photo(uuid) from public, anon;
revoke all on function public.set_player_headshot(uuid, text) from public, anon;
revoke all on function public.set_player_id_pdf(uuid, text) from public, anon;

grant execute on function public.player_id_from_storage_name(text) to authenticated;
grant execute on function public.can_write_player_photo(uuid) to authenticated;
grant execute on function public.can_read_player_photo(uuid) to authenticated;
grant execute on function public.set_player_headshot(uuid, text) to authenticated;
grant execute on function public.set_player_id_pdf(uuid, text) to authenticated;

-- Private bucket. 8 MB covers the PDF cap; the app still rejects images > 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-photos',
  'player-photos',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists player_photos_select on storage.objects;
create policy player_photos_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'player-photos'
    and public.can_read_player_photo(public.player_id_from_storage_name(name))
  );

drop policy if exists player_photos_insert on storage.objects;
create policy player_photos_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'player-photos'
    and public.can_write_player_photo(public.player_id_from_storage_name(name))
    and (
      name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/headshot-[0-9]+-[0-9a-f-]+\.(jpg|jpeg|png|webp)$'
      or name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/id-document-[0-9]+-[0-9a-f-]+\.pdf$'
    )
  );

drop policy if exists player_photos_update on storage.objects;
create policy player_photos_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'player-photos'
    and public.can_write_player_photo(public.player_id_from_storage_name(name))
  )
  with check (
    bucket_id = 'player-photos'
    and public.can_write_player_photo(public.player_id_from_storage_name(name))
  );

drop policy if exists player_photos_delete on storage.objects;
create policy player_photos_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'player-photos'
    and public.can_write_player_photo(public.player_id_from_storage_name(name))
  );
