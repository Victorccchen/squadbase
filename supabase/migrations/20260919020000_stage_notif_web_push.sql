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
