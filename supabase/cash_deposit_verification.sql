-- Phase 1 PR-08b verification: cash receipts, day close, deposits.
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
  v_director uuid := gen_random_uuid();
  v_parent uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_squad uuid;
  v_birth date;
  v_player uuid;
  v_pkg_item uuid;
  v_kit uuid;
  v_res jsonb;
  v_res2 jsonb;
  v_receipt uuid;
  v_closing uuid;
  v_deposit uuid;
  v_deposit2 uuid;
  v_today date := public.club_today();
  v_count integer;
  v_failed boolean;
begin
  insert into auth.users (id) values (v_admin), (v_director), (v_parent), (v_stranger);
  foreach v_res2 in array array[to_jsonb(v_admin), to_jsonb(v_director), to_jsonb(v_parent), to_jsonb(v_stranger)] loop
    perform pg_temp.as_user((v_res2 #>> '{}')::uuid);
    perform public.ensure_own_profile();
  end loop;
  insert into public.user_roles (user_id, role) values (v_admin, 'admin') on conflict do nothing;

  select d::date into v_birth
  from generate_series(v_today - interval '9 years', v_today - interval '5 years', interval '1 month') as g(d)
  where public.age_squad_band_from_birth_date(d::date, v_today) = 'U8'
  limit 1;
  select id into v_squad from public.teams where kind = 'age_squad' and age_band = 'U8';
  update public.teams set status = 'active' where id = v_squad;
  insert into public.players (birth_date, name_en_given, name_en_family, name_zh)
  values (v_birth, 'Cash', 'Verify', '現金') returning id into v_player;
  insert into public.guardian_player_links (guardian_user_id, player_id, status, reviewed_by, reviewed_at)
  values (v_parent, v_player, 'approved', v_admin, now());

  -- C08b-a Staff grant the director role; parents cannot record cash.
  perform pg_temp.as_user(v_admin);
  perform public.admin_set_player_age_squad(v_player, v_squad, 91);
  perform public.admin_set_director(v_director, true);
  select i.id into v_pkg_item
  from public.payment_items i join public.session_packages p on p.id = i.package_id
  where p.age_band = 'U8' and p.credits = 10 and p.active;
  v_kit := public.admin_upsert_payment_item(null, 'kit', '球衣', null, null, 800, true, 10);

  perform pg_temp.as_user(v_parent);
  v_failed := false;
  begin
    perform public.director_record_cash(v_player, v_kit);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'C08b-a failed: parent recorded cash';
  end if;

  -- C08b-g The director can find the child (read-only) but not guardian links.
  perform pg_temp.as_user(v_director);
  execute 'set local role authenticated';
  select count(*) into v_count from public.players where id = v_player;
  if v_count <> 1 then
    reset role;
    raise exception 'C08b-g failed: director cannot find the player';
  end if;
  select count(*) into v_count from public.guardian_player_links where player_id = v_player;
  reset role;
  if v_count <> 0 then
    raise exception 'C08b-g failed: director can read guardian links';
  end if;

  -- P08-3 Director takes cash for a package: receipt number, credits at once,
  -- the parent sees the receipt.
  perform pg_temp.as_user(v_director);
  v_res := public.director_record_cash(v_player, v_pkg_item);
  if v_res ->> 'receipt_no' !~ ('^C-' || to_char(v_today, 'YYYYMMDD') || '-001$') then
    raise exception 'P08-3 failed: receipt number %', v_res ->> 'receipt_no';
  end if;
  if pg_temp.balance(v_player) <> 10 or (v_res ->> 'credits_available')::integer <> 10 then
    raise exception 'P08-3 failed: credits not added at once';
  end if;
  v_receipt := (v_res ->> 'id')::uuid;
  if not exists (
    select 1 from public.session_credit_ledger
    where cash_receipt_id = v_receipt and entry_type = 'purchase' and amount = 10
  ) then
    raise exception 'P08-3 failed: no ledger purchase for the receipt';
  end if;
  perform pg_temp.as_user(v_parent);
  execute 'set local role authenticated';
  select count(*) into v_count from public.cash_receipts where id = v_receipt;
  reset role;
  if v_count <> 1 then
    raise exception 'P08-3 failed: parent cannot see the receipt';
  end if;
  perform pg_temp.as_user(v_stranger);
  execute 'set local role authenticated';
  select count(*) into v_count from public.cash_receipts where id = v_receipt;
  reset role;
  if v_count <> 0 then
    raise exception 'P08-3 failed: stranger can see the receipt';
  end if;

  -- C08b-b Kit with invoice: money only, sequence continues, invoice task opens.
  perform pg_temp.as_user(v_director);
  v_res2 := public.director_record_cash(v_player, v_kit, 750, 'size 130', true, '12345678', 'Cash Co');
  if v_res2 ->> 'receipt_no' !~ '-002$' or pg_temp.balance(v_player) <> 10 then
    raise exception 'C08b-b failed: %', v_res2;
  end if;
  if not exists (
    select 1 from public.invoices i
    join public.tasks t on t.dedupe_key = 'invoice:' || i.id and t.status = 'open'
    where i.payment_type = 'cash_receipt' and i.payment_id = (v_res2 ->> 'id')::uuid
  ) then
    raise exception 'C08b-b failed: no invoice task for the cash receipt';
  end if;

  -- C08b-c Voiding before the close reverses credits and drops the unissued invoice.
  perform public.director_void_cash_receipt((v_res2 ->> 'id')::uuid, 'wrong size');
  if exists (select 1 from public.invoices where payment_id = (v_res2 ->> 'id')::uuid) then
    raise exception 'C08b-c failed: invoice kept for a voided receipt';
  end if;
  v_res2 := public.director_record_cash(v_player, v_pkg_item);
  perform public.director_void_cash_receipt((v_res2 ->> 'id')::uuid, 'duplicate');
  if pg_temp.balance(v_player) <> 10 then
    raise exception 'C08b-c failed: void did not reverse credits (balance %)', pg_temp.balance(v_player);
  end if;

  -- 22:00 reminder: an earlier day's open receipt opens a director task.
  update public.cash_receipts set received_on = v_today - 1 where id = v_receipt;
  perform public.cash_reminders_sweep();
  if not exists (
    select 1 from public.tasks
    where dedupe_key = 'cash_close:' || v_director || ':' || (v_today - 1) and status = 'open' and assignee_role = 'director'
  ) then
    raise exception 'C08b-d failed: no close-day reminder';
  end if;
  -- The director sees their task.
  execute 'set local role authenticated';
  select count(*) into v_count from public.tasks where dedupe_key = 'cash_close:' || v_director || ':' || (v_today - 1);
  reset role;
  if v_count <> 1 then
    raise exception 'C08b-d failed: director cannot see the reminder';
  end if;

  -- P08-4 Close the day; voiding afterwards is refused; the reminder closes.
  v_closing := public.director_close_cash_day(v_today - 1);
  if (select total_twd from public.cash_closings where id = v_closing) <> 3500
     or (select receipt_count from public.cash_closings where id = v_closing) <> 1 then
    raise exception 'P08-4 failed: closing totals';
  end if;
  if (select status from public.tasks where dedupe_key = 'cash_close:' || v_director || ':' || (v_today - 1)) <> 'done' then
    raise exception 'P08-4 failed: reminder still open';
  end if;
  v_failed := false;
  begin
    perform public.director_void_cash_receipt(v_receipt, 'too late');
  exception when others then
    v_failed := sqlerrm like '%already closed%';
  end;
  if not v_failed then
    raise exception 'P08-4 failed: closed receipt voided';
  end if;
  v_failed := false;
  begin
    perform public.director_close_cash_day(v_today - 1);
  exception when others then
    v_failed := sqlerrm like '%nothing to close%';
  end;
  if not v_failed then
    raise exception 'P08-4 failed: empty close accepted';
  end if;

  -- P08-5 Deposit: the recorder cannot reconcile; a wrong amount is refused;
  -- staff reconcile a matching deposit.
  v_deposit := public.director_record_deposit(v_today, 3400, array[v_closing], 'short', null);
  if not exists (select 1 from public.tasks where dedupe_key = 'deposit:' || v_deposit and status = 'open' and assignee_role = 'staff') then
    raise exception 'P08-5 failed: no reconcile task';
  end if;
  v_failed := false;
  begin
    perform public.director_record_deposit(v_today, 3500, array[v_closing], null, null);
  exception when others then
    v_failed := sqlerrm like '%already deposited%';
  end;
  if not v_failed then
    raise exception 'P08-5 failed: closing deposited twice';
  end if;
  perform pg_temp.as_user(v_admin);
  v_failed := false;
  begin
    perform public.staff_reconcile_deposit(v_deposit);
  exception when others then
    v_failed := sqlerrm like '%does not match%';
  end;
  if not v_failed then
    raise exception 'P08-5 failed: mismatched deposit reconciled';
  end if;

  -- Admin as recorder: still cannot reconcile their own deposit.
  delete from public.bank_deposits where id = v_deposit;
  v_deposit2 := public.director_record_deposit(v_today, 3500, array[v_closing], null, null);
  v_failed := false;
  begin
    perform public.staff_reconcile_deposit(v_deposit2);
  exception when insufficient_privilege then
    v_failed := sqlerrm like '%own deposit%';
  end;
  if not v_failed then
    raise exception 'P08-5 failed: recorder reconciled their own deposit';
  end if;
  delete from public.bank_deposits where id = v_deposit2;

  perform pg_temp.as_user(v_director);
  v_deposit := public.director_record_deposit(v_today, 3500, array[v_closing], null, null);
  v_failed := false;
  begin
    perform public.staff_reconcile_deposit(v_deposit);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'P08-5 failed: director reconciled';
  end if;
  perform pg_temp.as_user(v_admin);
  perform public.staff_reconcile_deposit(v_deposit);
  if (select reconciled_by from public.bank_deposits where id = v_deposit) <> v_admin
     or (select status from public.tasks where dedupe_key = 'deposit:' || v_deposit) <> 'done' then
    raise exception 'P08-5 failed: reconcile not recorded';
  end if;
  if not exists (select 1 from public.audit_log where action = 'bank_deposit.reconciled' and entity_id = v_deposit) then
    raise exception 'P08-5 failed: reconcile not audited';
  end if;

  -- C08b-e A closing with no deposit after 7 days reminds the director.
  perform pg_temp.as_user(v_director);
  v_res := public.director_record_cash(v_player, v_kit, 500);
  v_closing := public.director_close_cash_day(v_today);
  update public.cash_closings set closing_date = v_today - 8 where id = v_closing;
  perform public.cash_reminders_sweep();
  if not exists (select 1 from public.tasks where dedupe_key = 'cash_deposit:' || v_closing and status = 'open') then
    raise exception 'C08b-e failed: no deposit reminder';
  end if;

  -- C08b-f Removing the role takes the power away.
  perform pg_temp.as_user(v_admin);
  perform public.admin_set_director(v_director, false);
  perform pg_temp.as_user(v_director);
  v_failed := false;
  begin
    perform public.director_record_cash(v_player, v_kit);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'C08b-f failed: former director recorded cash';
  end if;

  raise notice 'cash_deposit_verification: all checks passed';
end;
$$;

rollback;
