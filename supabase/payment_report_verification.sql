-- Phase 1 PR-08a verification: payment items, transfer report, invoices.
-- Self-contained; rolls back. Staging SQL Editor or CI (scripts/db-verify.sh).
-- Do not run against production. Synthetic names only.

begin;

create function pg_temp.as_user(p_uid uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true);
$$;

create function pg_temp.balance(p_player uuid)
returns integer
language sql
as $$
  select coalesce((select credits_available from public.player_session_balances where player_id = p_player), 0);
$$;

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_parent uuid := gen_random_uuid();
  v_other_parent uuid := gen_random_uuid();
  v_squad uuid;
  v_birth date;
  v_player uuid;
  v_other_player uuid;
  v_kit uuid;
  v_pkg_item uuid;
  v_pkg uuid;
  v_claim uuid;
  v_kit_claim uuid;
  v_invoice public.invoices%rowtype;
  v_task public.tasks%rowtype;
  v_path text;
  v_count integer;
  v_failed boolean;
begin
  insert into auth.users (id) values (v_admin), (v_parent), (v_other_parent);
  perform pg_temp.as_user(v_admin);
  perform public.ensure_own_profile();
  perform pg_temp.as_user(v_parent);
  perform public.ensure_own_profile();
  perform pg_temp.as_user(v_other_parent);
  perform public.ensure_own_profile();
  insert into public.user_roles (user_id, role) values (v_admin, 'admin') on conflict do nothing;

  select d::date into v_birth
  from generate_series(public.club_today() - interval '9 years', public.club_today() - interval '5 years', interval '1 month') as g(d)
  where public.age_squad_band_from_birth_date(d::date, public.club_today()) = 'U8'
  limit 1;
  select id into v_squad from public.teams where kind = 'age_squad' and age_band = 'U8';
  update public.teams set status = 'active' where id = v_squad;
  insert into public.players (birth_date, name_en_given, name_en_family, name_zh)
  values (v_birth, 'Pay', 'Verify', '繳費') returning id into v_player;
  insert into public.players (birth_date, name_en_given, name_en_family, name_zh)
  values (v_birth, 'Pay', 'Other', '別人') returning id into v_other_player;
  insert into public.guardian_player_links (guardian_user_id, player_id, status, reviewed_by, reviewed_at)
  values (v_parent, v_player, 'approved', v_admin, now()),
         (v_other_parent, v_other_player, 'approved', v_admin, now());
  perform pg_temp.as_user(v_admin);
  perform public.admin_set_player_age_squad(v_player, v_squad, 81);
  perform public.admin_set_player_age_squad(v_other_player, v_squad, 82);

  -- C08-a Every package has a credit_package item; new packages sync.
  if exists (
    select 1 from public.session_packages p
    left join public.payment_items i on i.package_id = p.id
    where i.id is null
  ) then
    raise exception 'C08-a failed: package without a payment item';
  end if;
  select id into v_pkg from public.session_packages where age_band = 'U8' and credits = 10 and active;
  select id into v_pkg_item from public.payment_items where package_id = v_pkg;
  if (select price_twd from public.payment_items where id = v_pkg_item)
     is distinct from (select price_twd from public.session_packages where id = v_pkg) then
    raise exception 'C08-a failed: package item price out of sync';
  end if;

  v_kit := public.admin_upsert_payment_item(null, 'kit', '球衣', 'ユニフォーム', 'Kit', 800, true, 10);

  -- C08-b Parents cannot create items or insert claims directly.
  perform pg_temp.as_user(v_parent);
  v_failed := false;
  begin
    perform public.admin_upsert_payment_item(null, 'kit', 'x', null, null, 1, true, 1);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'C08-b failed: parent created an item';
  end if;
  v_failed := false;
  execute 'set local role authenticated';
  begin
    insert into public.payment_claims (player_id, guardian_user_id, package_id, item_id, last5, amount_twd, price_twd_snapshot, credits_snapshot)
    values (v_player, v_parent, v_pkg, v_pkg_item, '11111', 1, 1, 30);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  reset role;
  if not v_failed then
    raise exception 'C08-b failed: parent inserted a claim with their own price';
  end if;

  -- C08-c Validation: future transfer date, bad tax id, bad amount.
  v_failed := false;
  begin
    perform public.submit_payment_report(v_player, v_kit, 800, public.club_today() + 1, '12345');
  exception when others then
    v_failed := sqlerrm like '%invalid transfer date%';
  end;
  if not v_failed then
    raise exception 'C08-c failed: future transfer date accepted';
  end if;
  v_failed := false;
  begin
    perform public.submit_payment_report(v_player, v_kit, 800, public.club_today(), '12345', true, '1234', null, null);
  exception when others then
    v_failed := sqlerrm like '%invalid tax id%';
  end;
  if not v_failed then
    raise exception 'C08-c failed: bad tax id accepted';
  end if;
  v_failed := false;
  begin
    perform public.submit_payment_report(v_player, v_kit, -5, public.club_today(), '12345');
  exception when others then
    v_failed := sqlerrm like '%invalid amount%';
  end;
  if not v_failed then
    raise exception 'C08-c failed: negative amount accepted';
  end if;

  -- P08-1 Kit transfer: approved, money recorded, credits untouched.
  v_kit_claim := public.submit_payment_report(v_player, v_kit, 750, public.club_today() - 1, '24680');
  -- A package report can wait alongside it (one open report per item).
  v_claim := public.submit_payment_report(
    v_player, v_pkg_item, 1, public.club_today(), '13579', true, '12345678', 'Verify Co', null);
  v_failed := false;
  begin
    perform public.submit_payment_report(v_player, v_kit, 750, public.club_today(), '24681');
  exception when others then
    v_failed := sqlerrm like '%already has a pending claim%';
  end;
  if not v_failed then
    raise exception 'P08-1 failed: second open kit report accepted';
  end if;

  perform pg_temp.as_user(v_admin);
  perform public.admin_review_payment_claim(v_kit_claim, 'approved', null);
  if pg_temp.balance(v_player) <> 0
     or exists (select 1 from public.session_credit_ledger where claim_id = v_kit_claim) then
    raise exception 'P08-1 failed: kit payment changed credits';
  end if;
  if (select amount_twd from public.payment_claims where id = v_kit_claim) <> 750
     or (select credits_snapshot from public.payment_claims where id = v_kit_claim) is not null then
    raise exception 'P08-1 failed: kit claim amount wrong';
  end if;

  -- P08-2 Package with invoice: credits in at the package price (not the
  -- parent's amount), invoice task opens, recording the number closes it.
  if (select amount_twd from public.payment_claims where id = v_claim)
     is distinct from (select price_twd from public.session_packages where id = v_pkg) then
    raise exception 'P08-2 failed: package amount not taken from the package';
  end if;
  perform public.admin_review_payment_claim(v_claim, 'approved', null);
  if pg_temp.balance(v_player) <> 10 then
    raise exception 'P08-2 failed: balance %', pg_temp.balance(v_player);
  end if;
  select * into v_invoice from public.invoices where payment_type = 'transfer_claim' and payment_id = v_claim;
  if v_invoice.id is null or v_invoice.tax_id <> '12345678' or v_invoice.title <> 'Verify Co' then
    raise exception 'P08-2 failed: invoice row missing or wrong';
  end if;
  select * into v_task from public.tasks where dedupe_key = 'invoice:' || v_invoice.id;
  if v_task.status is distinct from 'open' or v_task.assignee_role <> 'staff' then
    raise exception 'P08-2 failed: no open invoice task';
  end if;
  v_failed := false;
  begin
    perform public.admin_record_invoice(v_invoice.id, 'bad no!');
  exception when others then
    v_failed := sqlerrm like '%invalid invoice number%';
  end;
  if not v_failed then
    raise exception 'P08-2 failed: bad invoice number accepted';
  end if;
  perform public.admin_record_invoice(v_invoice.id, 'ab-12345678');
  select * into v_invoice from public.invoices where id = v_invoice.id;
  if v_invoice.invoice_no <> 'AB-12345678' or v_invoice.issued_by <> v_admin
     or (select status from public.tasks where dedupe_key = 'invoice:' || v_invoice.id) <> 'done' then
    raise exception 'P08-2 failed: invoice not recorded or task open';
  end if;
  -- No invoice requested → no invoice row.
  if exists (select 1 from public.invoices where payment_id = v_kit_claim) then
    raise exception 'P08-2 failed: invoice created without a request';
  end if;

  -- C08-d Proof screenshot: only the child's parent may upload to that folder,
  -- and the report must point at an existing object for the same child.
  v_path := v_player::text || '/proof-1-' || gen_random_uuid()::text || '.jpg';
  perform pg_temp.as_user(v_other_parent);
  execute 'set local role authenticated';
  v_failed := false;
  begin
    insert into storage.objects (bucket_id, name) values ('payment-proofs', v_path);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  reset role;
  if not v_failed then
    raise exception 'C08-d failed: another parent uploaded into this child''s folder';
  end if;
  perform pg_temp.as_user(v_parent);
  execute 'set local role authenticated';
  insert into storage.objects (bucket_id, name) values ('payment-proofs', v_path);
  reset role;
  v_kit_claim := public.submit_payment_report(v_player, v_kit, 800, public.club_today(), '55555', false, null, null, v_path);
  if (select screenshot_path from public.payment_claims where id = v_kit_claim) <> v_path then
    raise exception 'C08-d failed: screenshot not stored';
  end if;
  perform pg_temp.as_user(v_other_parent);
  execute 'set local role authenticated';
  select count(*) into v_count from storage.objects where bucket_id = 'payment-proofs' and name = v_path;
  reset role;
  if v_count <> 0 then
    raise exception 'C08-d failed: another parent can read the screenshot';
  end if;
  perform pg_temp.as_user(v_parent);
  v_failed := false;
  begin
    perform public.submit_payment_report(
      v_other_player, v_kit, 800, public.club_today(), '55556', false, null, null, v_path);
  exception when others then
    v_failed := sqlerrm like '%not an approved guardian%' or sqlerrm like '%invalid screenshot path%';
  end;
  if not v_failed then
    raise exception 'C08-d failed: screenshot reused for another child';
  end if;

  -- C08-e Deactivating a package deactivates its item; new reports are refused.
  perform pg_temp.as_user(v_admin);
  update public.session_packages set active = false where id = v_pkg;
  if (select active from public.payment_items where id = v_pkg_item) then
    raise exception 'C08-e failed: item still active';
  end if;
  perform pg_temp.as_user(v_parent);
  v_failed := false;
  begin
    perform public.submit_payment_report(v_player, v_pkg_item, null, public.club_today(), '77777');
  exception when others then
    v_failed := sqlerrm like '%not found or inactive%';
  end;
  if not v_failed then
    raise exception 'C08-e failed: inactive package item accepted';
  end if;

  -- C08-f Only staff record invoices.
  v_failed := false;
  begin
    perform public.admin_record_invoice(v_invoice.id, 'XY-1');
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'C08-f failed: parent recorded an invoice';
  end if;

  raise notice 'payment_report_verification: all checks passed';
end;
$$;

rollback;
