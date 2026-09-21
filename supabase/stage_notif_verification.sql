-- Stage Notif verification (staging SQL Editor only).
-- Do not run against production. Synthetic names, not real PII.
-- Run AFTER 20260919020000_stage_notif_web_push.sql.
-- The block rolls back so staging stays empty unless you change ROLLBACK to COMMIT.

begin;

do $$
begin
  if to_regclass('public.push_subscriptions') is null then
    raise exception 'TN-P SQL failed: missing push_subscriptions';
  end if;
  if to_regclass('public.notification_sends') is null then
    raise exception 'TN-P SQL failed: missing notification_sends';
  end if;
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'push_subscriptions_endpoint_uidx'
  ) then
    raise exception 'TN-P SQL failed: missing unique endpoint index';
  end if;
  raise notice 'TN-P SQL passed: push tables exist';
end
$$;

rollback;
