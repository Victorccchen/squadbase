-- One-off staging repair: apply the baseline pieces that
-- supabase/baseline_objects_verification.sql reported missing on staging
-- (2026-10-01):
--
--   20260902220000 admin_revoke_guardian_link        (lifecycle: revoke / withdraw links)
--   20260919020000 push_subscriptions, notification_sends (Stage Notif)
--   20260921030000 admin_soft_delete_match
--
-- STAGING ONLY. Paste the CONTENTS into the staging SQL Editor once, then run
-- baseline_objects_verification.sql again; it must say all objects present.
-- Runs in one transaction: either everything applies or nothing does.
--
-- Deliberately NOT included from 20260902220000:
--   * admin_delete_team: three later migrations redefined it (latest in
--     20260904000000); re-running the old body would roll it back.
--   * guardian_player_links_open_pair_idx: 20260907000000 already recreated it
--     with the same definition.
-- Everything below is copied unchanged from the original migration files.

begin;

-- ---------------------------------------------------------------------------
-- From 20260902220000_lifecycle_revoke_and_team_delete.sql
-- ---------------------------------------------------------------------------
comment on type public.link_status is
  'Admin approval state. pending/approved occupy the open-pair unique index. rejected/revoked are history; the pair may apply again. Only approved guardians may read linked player rows.';

comment on table public.guardian_player_links is
  'Parent requests to link to an existing player. Admins approve, reject, or revoke approved links. Parents may withdraw (revoke) their own pending request. Pending/rejected/revoked must not read player PII via table SELECT.';


-- revoked: parent withdraw keeps review columns null; admin revoke sets them.
alter table public.guardian_player_links
  drop constraint if exists guardian_player_links_review_fields_match_status;

alter table public.guardian_player_links
  add constraint guardian_player_links_review_fields_match_status check (
    (
      status = 'pending'
      and reviewed_by is null
      and reviewed_at is null
    )
    or (
      status in ('approved', 'rejected')
      and reviewed_by is not null
      and reviewed_at is not null
    )
    or (
      status = 'revoked'
    )
  );

create or replace function public.admin_revoke_guardian_link(
  p_link_id uuid,
  p_admin_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.guardian_player_links
  set
    status = 'revoked',
    admin_note = nullif(btrim(coalesce(p_admin_note, '')), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_by = auth.uid()
  where id = p_link_id
    and status = 'approved';

  if not found then
    raise exception 'link not found or not approved' using errcode = 'P0002';
  end if;

  return p_link_id;
end;
$$;

comment on function public.admin_revoke_guardian_link(uuid, text) is
  'Admin-only. Soft-revokes an approved guardian_player_links row. After this, is_approved_guardian_for_player is false for that pair.';

-- Parents may update only their own pending row, and only to revoked,
-- without writing review/admin columns. Identity fields are locked by trigger.
drop policy if exists guardian_player_links_update_own_pending_to_revoked
  on public.guardian_player_links;
create policy guardian_player_links_update_own_pending_to_revoked
  on public.guardian_player_links
  for update
  to authenticated
  using (
    guardian_user_id = auth.uid()
    and status = 'pending'
  )
  with check (
    guardian_user_id = auth.uid()
    and status = 'revoked'
    and reviewed_by is null
    and reviewed_at is null
    and admin_note is null
  );

create or replace function public.guardian_player_links_restrict_parent_update()
returns trigger
language plpgsql
as $$
begin
  -- SQL Editor / service role: auth.uid() is null. Allow.
  if auth.uid() is null then
    return new;
  end if;

  if public.has_role('admin') then
    return new;
  end if;

  if old.status is distinct from 'pending'
     or new.status is distinct from 'revoked'
     or old.guardian_user_id is distinct from new.guardian_user_id
     or old.player_id is distinct from new.player_id
     or old.relation is distinct from new.relation
     or old.parent_note is distinct from new.parent_note
     or old.created_by is distinct from new.created_by
     or new.reviewed_by is not null
     or new.reviewed_at is not null
     or new.admin_note is not null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guardian_player_links_restrict_parent_update
  on public.guardian_player_links;
create trigger guardian_player_links_restrict_parent_update
  before update on public.guardian_player_links
  for each row
  execute function public.guardian_player_links_restrict_parent_update();

revoke all on function public.guardian_player_links_restrict_parent_update() from public, anon;
grant execute on function public.guardian_player_links_restrict_parent_update() to authenticated;

revoke all on function public.admin_revoke_guardian_link(uuid, text) from public, anon;
grant execute on function public.admin_revoke_guardian_link(uuid, text) to authenticated;

-- Table privileges already granted in Stage 3; re-assert for this follow-up.
revoke all on table public.guardian_player_links from public, anon;
grant select, insert, update, delete on table public.guardian_player_links to authenticated;

-- ---------------------------------------------------------------------------
-- From 20260919020000_stage_notif_web_push.sql
-- ---------------------------------------------------------------------------
-- Stage Notif: Web Push subscriptions + send log (staging only).
-- Do not run against production.
--
-- Parents store their own PWA PushSubscription (endpoint + keys).
-- Admins send from Stage N (template → audience → preview). Coaches are
-- not a default audience. Production send stays out of scope.
--
-- Victor: paste this file's CONTENTS into the staging SQL Editor, not a path
-- string. Then paste 20260919030000_regrant_stage_notif_privileges.sql if
-- authenticated callers see permission denied.
--
-- Idempotent. Safe to re-run.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint push_subscriptions_endpoint_not_blank
    check (char_length(trim(endpoint)) > 0),
  constraint push_subscriptions_p256dh_not_blank
    check (char_length(trim(p256dh)) > 0),
  constraint push_subscriptions_auth_not_blank
    check (char_length(trim(auth)) > 0),
  constraint push_subscriptions_user_agent_length
    check (user_agent is null or char_length(user_agent) <= 500)
);

create unique index if not exists push_subscriptions_endpoint_uidx
  on public.push_subscriptions (endpoint);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

create index if not exists push_subscriptions_enabled_user_idx
  on public.push_subscriptions (user_id)
  where enabled = true;

comment on table public.push_subscriptions is
  'PWA Web Push subscriptions. Parents upsert their own row. Admins read enabled rows to send. 410/gone sets enabled = false. No phones or roster PII.';

create table if not exists public.notification_sends (
  id uuid primary key default gen_random_uuid(),
  sent_by uuid not null references public.profiles (id) on delete restrict,
  template_key text not null,
  audience_key text not null,
  source_session_id uuid references public.training_sessions (id) on delete set null,
  audience_team_id uuid references public.teams (id) on delete set null,
  locale text not null,
  title text not null,
  body text not null,
  url text not null,
  intended_count integer not null default 0,
  subscribed_count integer not null default 0,
  skipped_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  constraint notification_sends_template_key_known
    check (template_key in (
      'regular_training_signup',
      'special_training_signup',
      'match_signup',
      'match_notes',
      'thanks',
      'match_report'
    )),
  constraint notification_sends_audience_key_known
    check (audience_key in ('age_squad', 'competition_team', 'session_registrations')),
  constraint notification_sends_locale_known
    check (locale in ('zh-Hant', 'en', 'ja')),
  constraint notification_sends_counts_nonneg
    check (
      intended_count >= 0
      and subscribed_count >= 0
      and skipped_count >= 0
      and sent_count >= 0
      and failed_count >= 0
    ),
  constraint notification_sends_title_not_blank
    check (char_length(trim(title)) > 0),
  constraint notification_sends_body_not_blank
    check (char_length(trim(body)) > 0),
  constraint notification_sends_url_not_blank
    check (char_length(trim(url)) > 0)
);

create index if not exists notification_sends_created_at_idx
  on public.notification_sends (created_at desc);

create index if not exists notification_sends_sent_by_idx
  on public.notification_sends (sent_by);

comment on table public.notification_sends is
  'Admin Web Push send log from Stage N. Counts only — no parent phones, addresses, or roster dumps.';

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row
  execute function public.set_updated_at();

drop trigger if exists push_subscriptions_set_actor_columns on public.push_subscriptions;
create trigger push_subscriptions_set_actor_columns
  before insert or update on public.push_subscriptions
  for each row
  execute function public.set_actor_columns();

alter table public.push_subscriptions enable row level security;
alter table public.notification_sends enable row level security;

revoke all on table public.push_subscriptions from public, anon;
revoke all on table public.notification_sends from public, anon;

grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant select, insert on table public.notification_sends to authenticated;

drop policy if exists push_subscriptions_select_own_or_admin on public.push_subscriptions;
create policy push_subscriptions_select_own_or_admin
  on public.push_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid() or public.has_role('admin'));

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own
  on public.push_subscriptions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_update_own_or_admin on public.push_subscriptions;
create policy push_subscriptions_update_own_or_admin
  on public.push_subscriptions
  for update
  to authenticated
  using (user_id = auth.uid() or public.has_role('admin'))
  with check (user_id = auth.uid() or public.has_role('admin'));

drop policy if exists push_subscriptions_delete_own_or_admin on public.push_subscriptions;
create policy push_subscriptions_delete_own_or_admin
  on public.push_subscriptions
  for delete
  to authenticated
  using (user_id = auth.uid() or public.has_role('admin'));

drop policy if exists notification_sends_select_admin on public.notification_sends;
create policy notification_sends_select_admin
  on public.notification_sends
  for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists notification_sends_insert_admin on public.notification_sends;
create policy notification_sends_insert_admin
  on public.notification_sends
  for insert
  to authenticated
  with check (public.has_role('admin') and sent_by = auth.uid());

-- ---------------------------------------------------------------------------
-- From 20260919030000_regrant_stage_notif_privileges.sql
-- ---------------------------------------------------------------------------
-- Stage Notif privilege follow-up (staging only). Do not run against production.
-- Idempotent. Does not change RLS policies. Safe to re-run.
--
-- Paste this file's CONTENTS in the staging SQL Editor (not a path string)
-- if authenticated callers see permission denied on push_subscriptions or
-- notification_sends after the main Stage Notif migration.

revoke all on table public.push_subscriptions from public, anon;
revoke all on table public.notification_sends from public, anon;

grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant select, insert on table public.notification_sends to authenticated;

-- ---------------------------------------------------------------------------
-- From 20260921030000_admin_soft_delete_match.sql
-- ---------------------------------------------------------------------------
-- Match-specific admin soft-delete (staging only). Do not run against production.
-- Paste this file's CONTENTS in the staging SQL Editor (not a path string).
-- Idempotent. Safe to re-run.
--
-- Why: admin match delete reused admin_soft_delete_session and could return
-- success even when training_sessions.deleted_at did not change (0-row UPDATE
-- is not an error). Cancel stays a different action (public_status=cancelled).
-- This RPC sets deleted_at, unpublishes, and errors if no row was updated.
-- Roster, registrations, and Q&A are not deleted.

create or replace function public.admin_soft_delete_session(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (select 1 from public.training_sessions where id = p_session_id) then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  update public.training_sessions
  set
    deleted_at = coalesce(deleted_at, now()),
    updated_by = auth.uid()
  where id = p_session_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  return p_session_id;
end;
$$;

create or replace function public.admin_soft_delete_match(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind public.session_kind;
  v_updated integer;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select s.kind into v_kind
  from public.training_sessions s
  join public.match_publications p on p.session_id = s.id
  where s.id = p_session_id;

  if v_kind is null then
    raise exception 'match not found' using errcode = 'P0002';
  end if;

  if not public.is_match_session_kind(v_kind) then
    raise exception 'match kind must be cup, league, or friendly' using errcode = '22023';
  end if;

  update public.training_sessions
  set
    deleted_at = coalesce(deleted_at, now()),
    updated_by = auth.uid()
  where id = p_session_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'match not found' using errcode = 'P0002';
  end if;

  -- Hide from the public list without cancelling (cancel remains a separate action).
  update public.match_publications
  set
    is_published = false,
    updated_by = auth.uid()
  where session_id = p_session_id;

  return p_session_id;
end;
$$;

comment on function public.admin_soft_delete_session(uuid) is
  'Admin-only. Sets deleted_at. Errors if the session row was not updated. Does not remove registrations or Q&A.';
comment on function public.admin_soft_delete_match(uuid) is
  'Admin-only one-match soft-delete. Sets training_sessions.deleted_at and unpublishes. Does not cancel. Roster/registrations/Q&A stay. Idempotent when already deleted.';

revoke all on function public.admin_soft_delete_session(uuid) from public, anon;
revoke all on function public.admin_soft_delete_match(uuid) from public, anon;

grant execute on function public.admin_soft_delete_session(uuid) to authenticated;
grant execute on function public.admin_soft_delete_match(uuid) to authenticated;

commit;
