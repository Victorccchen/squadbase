-- Deduplicate open guardian–player links and re-assert the unique partial index.
-- Staging SQL Editor only. Do not run against production.
--
-- Product rule (unchanged): at most one pending or approved row per
-- (guardian_user_id, player_id). rejected / revoked rows stay as history.
--
-- Staging already declared guardian_player_links_open_pair_idx in Stage 3 /
-- lifecycle, but duplicate approved rows were observed in the parent UI
-- (same child twice on /app/children, duplicate React keys on register /
-- credits). This file:
--   1. Drops the partial unique index if present (so cleanup can run even
--      if the index was missing or the table is inconsistent).
--   2. Soft-revokes extra open rows. For each (guardian, player) group,
--      keep the newest approved; if none are approved, keep the newest
--      pending. Extras become status = revoked with admin_note containing
--      'deduped by migration'. Rows are not hard-deleted.
--   3. Recreates the unique partial index.
--   4. Replaces admin_review_guardian_link so approving cannot open a
--      second pending/approved pair; raises a clear error instead.
--
-- Idempotent: a second paste finds no extras and recreates the same index.
-- Does not change Stage 4B credit debit / payment rules or RLS.

-- -----------------------------------------------------------------------------
-- 1. Drop the open-pair unique index so cleanup can always run.
-- -----------------------------------------------------------------------------
drop index if exists public.guardian_player_links_open_pair_idx;

-- -----------------------------------------------------------------------------
-- 2. Soft-revoke duplicate open links. Keep newest approved, else newest pending.
-- -----------------------------------------------------------------------------
with ranked as (
  select
    id,
    row_number() over (
      partition by guardian_user_id, player_id
      order by
        case status
          when 'approved' then 0
          when 'pending' then 1
          else 2
        end,
        created_at desc,
        updated_at desc,
        id desc
    ) as rn
  from public.guardian_player_links
  where status in ('pending', 'approved')
)
update public.guardian_player_links as link
set
  status = 'revoked',
  admin_note = left(
    case
      when nullif(btrim(coalesce(link.admin_note, '')), '') is null
        then 'deduped by migration'
      else btrim(link.admin_note) || ' | deduped by migration'
    end,
    1000
  ),
  updated_at = now()
from ranked
where link.id = ranked.id
  and ranked.rn > 1;

-- -----------------------------------------------------------------------------
-- 3. Recreate: at most one pending/approved pair per guardian × player.
-- -----------------------------------------------------------------------------
create unique index guardian_player_links_open_pair_idx
  on public.guardian_player_links (guardian_user_id, player_id)
  where status in ('pending', 'approved');

comment on index public.guardian_player_links_open_pair_idx is
  'At most one pending or approved guardian_player_links row per (guardian_user_id, player_id). rejected/revoked are history.';

-- -----------------------------------------------------------------------------
-- 4. Approve must not create a second open link for the same pair.
-- -----------------------------------------------------------------------------
create or replace function public.admin_review_guardian_link(
  p_link_id uuid,
  p_status public.link_status,
  p_admin_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guardian uuid;
  v_player uuid;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'invalid link status' using errcode = '22023';
  end if;

  select guardian_user_id, player_id
    into v_guardian, v_player
  from public.guardian_player_links
  where id = p_link_id
    and status = 'pending';

  if not found then
    raise exception 'link not found or not pending' using errcode = 'P0002';
  end if;

  if p_status = 'approved'
     and exists (
       select 1
       from public.guardian_player_links
       where guardian_user_id = v_guardian
         and player_id = v_player
         and id <> p_link_id
         and status in ('pending', 'approved')
     )
  then
    raise exception 'open guardian link already exists' using errcode = '23505';
  end if;

  update public.guardian_player_links
  set
    status = p_status,
    admin_note = nullif(btrim(coalesce(p_admin_note, '')), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_by = auth.uid()
  where id = p_link_id
    and status = 'pending';

  if not found then
    raise exception 'link not found or not pending' using errcode = 'P0002';
  end if;

  return p_link_id;
end;
$$;

revoke all on function public.admin_review_guardian_link(uuid, public.link_status, text) from public, anon;
grant execute on function public.admin_review_guardian_link(uuid, public.link_status, text) to authenticated;
