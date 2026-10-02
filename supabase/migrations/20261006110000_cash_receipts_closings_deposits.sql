-- Phase 1 PR-08b: cash receipts, day close, bank deposits (D4, D13).
-- Staging only. Do not run against production.
--
-- The youth director collects cash at the field. Two checks stand in for a
-- second person at the till:
--   1. the parent sees the electronic receipt at once (receipt number + amount);
--   2. a different person (staff, Kaori) reconciles each bank deposit against
--      the day closings it covers. The recorder of a deposit can never
--      reconcile it.
--
-- * director_record_cash: receipt C-YYYYMMDD-NNN (club date, daily sequence).
--   Credit packages credit the wallet at once (ledger purchase at the snapshot
--   price); other items record money only. Invoice requests open the PR-08a
--   invoice task.
-- * director_void_cash_receipt: only before the day is closed; reverses credits.
-- * director_close_cash_day: locks the caller's open receipts of that date.
-- * director_record_deposit / staff_reconcile_deposit: deposit covers closings;
--   reconcile requires the closings' total to equal the deposit.
-- * Reminders (hourly job): open receipts at 22:00 or later → director; a
--   closing with no deposit after 7 days → director; a deposit to reconcile →
--   staff (opened when recorded).
-- * admin_set_director: staff grant or remove the director role.

-- 1. Who may handle cash ---------------------------------------------------------------

create or replace function public.can_handle_cash()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('director') or public.has_role('admin');
$$;

create or replace function public.admin_set_director(p_user_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if coalesce(p_enabled, false) then
    insert into public.user_roles (user_id, role, created_by, updated_by)
    values (p_user_id, 'director', auth.uid(), auth.uid())
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = p_user_id and role = 'director';
  end if;
end;
$$;

-- Directors see the tasks addressed to them (the inbox stays admin-only otherwise).
drop policy if exists tasks_select_director on public.tasks;
create policy tasks_select_director
  on public.tasks
  for select
  to authenticated
  using (assignee_role = 'director' and public.has_role('director'));

-- 2. Tables -----------------------------------------------------------------------------

create table if not exists public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  closing_date date not null,
  total_twd integer not null,
  receipt_count integer not null,
  closed_by uuid not null references auth.users (id),
  closed_at timestamptz not null default now(),
  constraint cash_closings_totals check (total_twd >= 0 and receipt_count > 0)
);

create table if not exists public.cash_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  player_id uuid not null references public.players (id) on delete restrict,
  item_id uuid not null references public.payment_items (id) on delete restrict,
  package_id uuid references public.session_packages (id) on delete restrict,
  amount_twd integer not null,
  credits_snapshot integer,
  price_twd_snapshot integer,
  received_on date not null,
  received_at timestamptz not null default now(),
  received_by uuid not null references auth.users (id),
  note text,
  invoice_needed boolean not null default false,
  invoice_tax_id text,
  invoice_title text,
  closing_id uuid references public.cash_closings (id) on delete restrict,
  voided_at timestamptz,
  voided_by uuid references auth.users (id),
  void_reason text,
  constraint cash_receipts_no_format check (receipt_no ~ '^C-[0-9]{8}-[0-9]{3,}$'),
  constraint cash_receipts_amount_range check (amount_twd between 1 and 200000),
  constraint cash_receipts_package_snapshot check (
    (package_id is null and credits_snapshot is null)
    or (package_id is not null and credits_snapshot > 0 and price_twd_snapshot >= 0)
  ),
  constraint cash_receipts_note_length check (note is null or char_length(note) <= 300),
  constraint cash_receipts_invoice_fields check (
    (invoice_tax_id is null or invoice_tax_id ~ '^[0-9]{8}$')
    and (invoice_title is null or char_length(invoice_title) <= 100)
  ),
  constraint cash_receipts_void_complete check ((voided_at is null) = (voided_by is null)),
  constraint cash_receipts_void_or_close check (voided_at is null or closing_id is null)
);

create index if not exists cash_receipts_player_idx on public.cash_receipts (player_id, received_at desc);
create index if not exists cash_receipts_open_idx on public.cash_receipts (received_by, received_on)
  where closing_id is null and voided_at is null;

create table if not exists public.bank_deposits (
  id uuid primary key default gen_random_uuid(),
  deposit_date date not null,
  amount_twd integer not null,
  slip_path text,
  note text,
  recorded_by uuid not null references auth.users (id),
  recorded_at timestamptz not null default now(),
  reconciled_by uuid references auth.users (id),
  reconciled_at timestamptz,
  constraint bank_deposits_amount_positive check (amount_twd > 0),
  constraint bank_deposits_reconciled_complete check ((reconciled_by is null) = (reconciled_at is null)),
  constraint bank_deposits_not_self_reconciled check (reconciled_by is null or reconciled_by <> recorded_by),
  constraint bank_deposits_note_length check (note is null or char_length(note) <= 300),
  constraint bank_deposits_slip_path check (
    slip_path is null
    or slip_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/slip-[0-9]+-[0-9a-f-]+\.(jpg|jpeg|png|webp)$'
  )
);

create table if not exists public.bank_deposit_closings (
  deposit_id uuid not null references public.bank_deposits (id) on delete cascade,
  closing_id uuid not null unique references public.cash_closings (id) on delete restrict,
  primary key (deposit_id, closing_id)
);

comment on table public.cash_receipts is
  'Cash taken by the youth director (D13). receipt_no C-YYYYMMDD-NNN is the parent''s electronic receipt. Void only before the day is closed.';
comment on table public.cash_closings is
  'One director''s day close: locks that day''s open receipts.';
comment on table public.bank_deposits is
  'Cash deposited to the company account (D4). Reconciled by someone other than the recorder.';

-- The ledger links cash purchases and their reversal to the receipt.
alter table public.session_credit_ledger
  add column if not exists cash_receipt_id uuid references public.cash_receipts (id) on delete restrict;

-- 3. RLS -----------------------------------------------------------------------------------

alter table public.cash_receipts enable row level security;
alter table public.cash_closings enable row level security;
alter table public.bank_deposits enable row level security;
alter table public.bank_deposit_closings enable row level security;

revoke all on table public.cash_receipts from public, anon;
revoke all on table public.cash_closings from public, anon;
revoke all on table public.bank_deposits from public, anon;
revoke all on table public.bank_deposit_closings from public, anon;
grant select on table public.cash_receipts to authenticated;
grant select on table public.cash_closings to authenticated;
grant select on table public.bank_deposits to authenticated;
grant select on table public.bank_deposit_closings to authenticated;

drop policy if exists cash_receipts_select on public.cash_receipts;
create policy cash_receipts_select
  on public.cash_receipts
  for select
  to authenticated
  using (public.can_handle_cash() or public.is_approved_guardian_for_player(player_id));

drop policy if exists cash_closings_select on public.cash_closings;
create policy cash_closings_select
  on public.cash_closings
  for select
  to authenticated
  using (public.can_handle_cash());

drop policy if exists bank_deposits_select on public.bank_deposits;
create policy bank_deposits_select
  on public.bank_deposits
  for select
  to authenticated
  using (public.can_handle_cash());

drop policy if exists bank_deposit_closings_select on public.bank_deposit_closings;
create policy bank_deposit_closings_select
  on public.bank_deposit_closings
  for select
  to authenticated
  using (public.can_handle_cash());

-- Directors take money from any family: read-only access to who the players
-- are, their teams and credit balances (no guardian links, no photos policy).
drop policy if exists players_select_director on public.players;
create policy players_select_director
  on public.players
  for select
  to authenticated
  using (public.has_role('director'));

drop policy if exists teams_select_director on public.teams;
create policy teams_select_director
  on public.teams
  for select
  to authenticated
  using (public.has_role('director'));

drop policy if exists team_memberships_select_director on public.team_memberships;
create policy team_memberships_select_director
  on public.team_memberships
  for select
  to authenticated
  using (public.has_role('director'));

drop policy if exists player_session_balances_select_director on public.player_session_balances;
create policy player_session_balances_select_director
  on public.player_session_balances
  for select
  to authenticated
  using (public.has_role('director'));

-- Deposit slips: private bucket, the recorder's folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deposit-slips', 'deposit-slips', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists deposit_slips_select on storage.objects;
create policy deposit_slips_select
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'deposit-slips' and public.can_handle_cash());

drop policy if exists deposit_slips_insert on storage.objects;
create policy deposit_slips_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'deposit-slips'
    and public.can_handle_cash()
    and split_part(name, '/', 1) = auth.uid()::text
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/slip-[0-9]+-[0-9a-f-]+\.(jpg|jpeg|png|webp)$'
  );

-- 4. Receipts ----------------------------------------------------------------------------

create or replace function public.next_cash_receipt_no(p_day date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text := 'C-' || to_char(p_day, 'YYYYMMDD') || '-';
  v_next integer;
begin
  perform pg_advisory_xact_lock(hashtext('cash_receipt_no:' || p_day::text));
  select coalesce(max(substr(receipt_no, char_length(v_prefix) + 1)::integer), 0) + 1
    into v_next
  from public.cash_receipts
  where receipt_no like v_prefix || '%';
  return v_prefix || lpad(v_next::text, 3, '0');
end;
$$;

create or replace function public.director_record_cash(
  p_player_id uuid,
  p_item_id uuid,
  p_amount_twd integer default null,
  p_note text default null,
  p_invoice_needed boolean default false,
  p_invoice_tax_id text default null,
  p_invoice_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.payment_items%rowtype;
  v_pkg public.session_packages%rowtype;
  v_band public.package_age_band;
  v_amount integer;
  v_credits integer;
  v_day date := public.club_today();
  v_no text;
  v_id uuid;
  v_tax text;
  v_title text;
  v_bal public.player_session_balances%rowtype;
  v_unit numeric(12, 4);
  v_new_avg numeric(12, 4);
  v_balance integer;
begin
  if auth.uid() is null or not public.can_handle_cash() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'player not found' using errcode = 'P0002';
  end if;
  select * into v_item from public.payment_items where id = p_item_id and active;
  if v_item.id is null then
    raise exception 'item not found or inactive';
  end if;

  if v_item.kind = 'credit_package' then
    select * into v_pkg from public.session_packages where id = v_item.package_id and active;
    if v_pkg.id is null then
      raise exception 'package not found or inactive';
    end if;
    v_band := public.player_team_catalog_band(p_player_id);
    if v_band is null then
      raise exception 'credits do not apply to this age band';
    end if;
    if v_band is distinct from v_pkg.age_band then
      raise exception 'package band mismatch';
    end if;
    v_amount := v_pkg.price_twd;
    v_credits := v_pkg.credits;
  else
    v_amount := coalesce(p_amount_twd, v_item.price_twd);
    if v_amount is null or v_amount <= 0 or v_amount > 200000 then
      raise exception 'invalid amount' using errcode = '22023';
    end if;
  end if;

  if coalesce(p_invoice_needed, false) then
    v_tax := nullif(btrim(coalesce(p_invoice_tax_id, '')), '');
    if v_tax is not null and v_tax !~ '^[0-9]{8}$' then
      raise exception 'invalid tax id' using errcode = '22023';
    end if;
    v_title := nullif(left(btrim(coalesce(p_invoice_title, '')), 100), '');
  end if;

  v_no := public.next_cash_receipt_no(v_day);
  insert into public.cash_receipts (
    receipt_no, player_id, item_id, package_id, amount_twd, credits_snapshot, price_twd_snapshot,
    received_on, received_by, note, invoice_needed, invoice_tax_id, invoice_title
  )
  values (
    v_no, p_player_id, v_item.id, v_item.package_id, v_amount, v_credits,
    case when v_credits is null then null else v_amount end,
    v_day, auth.uid(), nullif(left(btrim(coalesce(p_note, '')), 300), ''),
    coalesce(p_invoice_needed, false), v_tax, v_title
  )
  returning id into v_id;

  if v_credits is not null then
    perform public.ensure_player_session_balance(p_player_id);
    select * into v_bal from public.player_session_balances where player_id = p_player_id for update;
    v_unit := v_amount::numeric / v_credits::numeric;
    if v_bal.credits_available <= 0 then
      v_new_avg := v_unit;
    else
      v_new_avg := ((v_bal.credits_available::numeric * v_bal.avg_unit_cost_twd) + (v_credits::numeric * v_unit))
                   / (v_bal.credits_available + v_credits)::numeric;
    end if;
    update public.player_session_balances
    set credits_available = credits_available + v_credits,
        avg_unit_cost_twd = v_new_avg,
        updated_by = auth.uid()
    where player_id = p_player_id;
    insert into public.session_credit_ledger (
      player_id, entry_type, amount, unit_cost_twd, amount_twd, package_id, cash_receipt_id, actor_user_id, reason
    )
    values (
      p_player_id, 'purchase', v_credits, v_unit, v_amount, v_item.package_id, v_id, auth.uid(),
      'cash receipt ' || v_no
    );
  end if;

  if coalesce(p_invoice_needed, false) then
    perform public.open_invoice_for_payment('cash_receipt', v_id, p_player_id, v_tax, v_title, v_amount);
  end if;

  perform public.write_audit('cash_receipt.recorded', 'cash_receipt', v_id, null,
    jsonb_build_object('receipt_no', v_no, 'player_id', p_player_id, 'item_id', v_item.id,
                       'amount_twd', v_amount, 'credits', v_credits));

  select credits_available into v_balance from public.player_session_balances where player_id = p_player_id;
  return jsonb_build_object('id', v_id, 'receipt_no', v_no, 'amount_twd', v_amount,
                            'credits', v_credits, 'credits_available', v_balance);
end;
$$;

create or replace function public.director_void_cash_receipt(p_receipt_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.cash_receipts%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_unit numeric(12, 4);
  v_invoice public.invoices%rowtype;
begin
  if auth.uid() is null or not public.can_handle_cash() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(v_reason) < 2 then
    raise exception 'reason required' using errcode = '22023';
  end if;
  select * into v_r from public.cash_receipts where id = p_receipt_id for update;
  if v_r.id is null then
    raise exception 'receipt not found' using errcode = 'P0002';
  end if;
  if v_r.voided_at is not null then
    raise exception 'receipt already voided' using errcode = 'P0001';
  end if;
  if v_r.closing_id is not null then
    raise exception 'receipt already closed' using errcode = 'P0001';
  end if;
  if v_r.received_by <> auth.uid() and not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.cash_receipts
  set voided_at = now(), voided_by = auth.uid(), void_reason = left(v_reason, 300)
  where id = p_receipt_id;

  if v_r.credits_snapshot is not null then
    v_unit := v_r.price_twd_snapshot::numeric / v_r.credits_snapshot::numeric;
    perform public.ensure_player_session_balance(v_r.player_id);
    update public.player_session_balances
    set credits_available = credits_available - v_r.credits_snapshot,
        updated_by = auth.uid()
    where player_id = v_r.player_id;
    insert into public.session_credit_ledger (
      player_id, entry_type, amount, unit_cost_twd, amount_twd, package_id, cash_receipt_id, actor_user_id, reason
    )
    values (
      v_r.player_id, 'reversal', -v_r.credits_snapshot, v_unit, v_r.price_twd_snapshot, v_r.package_id,
      v_r.id, auth.uid(), left('cash receipt voided ' || v_r.receipt_no || ': ' || v_reason, 500)
    );
  end if;

  -- An invoice not yet issued is dropped with its task; an issued one needs a manual credit note.
  select * into v_invoice from public.invoices where payment_type = 'cash_receipt' and payment_id = v_r.id;
  if v_invoice.id is not null and v_invoice.invoice_no is null then
    perform public.close_task_by_key('invoice:' || v_invoice.id, 'dismissed');
    delete from public.invoices where id = v_invoice.id;
  end if;

  perform public.write_audit('cash_receipt.voided', 'cash_receipt', v_r.id,
    jsonb_build_object('receipt_no', v_r.receipt_no, 'amount_twd', v_r.amount_twd),
    jsonb_build_object('reason', v_reason));
end;
$$;

-- 5. Day close ------------------------------------------------------------------------------

create or replace function public.director_close_cash_day(p_day date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_total integer;
  v_count integer;
begin
  if auth.uid() is null or not public.can_handle_cash() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_day is null or p_day > public.club_today() then
    raise exception 'invalid closing date' using errcode = '22023';
  end if;

  select coalesce(sum(amount_twd), 0)::integer, count(*)::integer into v_total, v_count
  from public.cash_receipts
  where received_by = auth.uid()
    and received_on = p_day
    and closing_id is null
    and voided_at is null;
  if v_count = 0 then
    raise exception 'nothing to close' using errcode = 'P0001';
  end if;

  insert into public.cash_closings (closing_date, total_twd, receipt_count, closed_by)
  values (p_day, v_total, v_count, auth.uid())
  returning id into v_id;

  update public.cash_receipts
  set closing_id = v_id
  where received_by = auth.uid()
    and received_on = p_day
    and closing_id is null
    and voided_at is null;

  perform public.close_task_by_key('cash_close:' || auth.uid() || ':' || p_day);
  perform public.write_audit('cash_closing.closed', 'cash_closing', v_id, null,
    jsonb_build_object('date', p_day, 'total_twd', v_total, 'receipt_count', v_count));
  return v_id;
end;
$$;

-- 6. Deposits --------------------------------------------------------------------------------

create or replace function public.director_record_deposit(
  p_deposit_date date,
  p_amount_twd integer,
  p_closing_ids uuid[],
  p_note text default null,
  p_slip_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_closing uuid;
begin
  if auth.uid() is null or not public.can_handle_cash() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_deposit_date is null or p_deposit_date > public.club_today() then
    raise exception 'invalid deposit date' using errcode = '22023';
  end if;
  if p_amount_twd is null or p_amount_twd <= 0 or p_amount_twd > 10000000 then
    raise exception 'invalid amount' using errcode = '22023';
  end if;
  if p_closing_ids is null or cardinality(p_closing_ids) = 0 then
    raise exception 'no closings selected' using errcode = '22023';
  end if;
  foreach v_closing in array p_closing_ids loop
    if not exists (
      select 1 from public.cash_closings c
      where c.id = v_closing
        and (c.closed_by = auth.uid() or public.has_role('admin'))
    ) then
      raise exception 'closing not found' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.bank_deposit_closings where closing_id = v_closing) then
      raise exception 'closing already deposited' using errcode = 'P0001';
    end if;
  end loop;
  if p_slip_path is not null and (
    split_part(p_slip_path, '/', 1) <> auth.uid()::text
    or not exists (select 1 from storage.objects where bucket_id = 'deposit-slips' and name = p_slip_path)
  ) then
    raise exception 'invalid slip path' using errcode = '22023';
  end if;

  insert into public.bank_deposits (deposit_date, amount_twd, slip_path, note, recorded_by)
  values (p_deposit_date, p_amount_twd, p_slip_path, nullif(left(btrim(coalesce(p_note, '')), 300), ''), auth.uid())
  returning id into v_id;

  insert into public.bank_deposit_closings (deposit_id, closing_id)
  select v_id, x from (select distinct unnest(p_closing_ids) as x) s;

  perform public.close_task_by_key('cash_deposit:' || c) from unnest(p_closing_ids) as c;
  perform public.open_task(
    'deposit.reconcile', 'bank_deposit', v_id, 'deposit:' || v_id, 'staff', null,
    jsonb_build_object('amount_twd', p_amount_twd, 'deposit_date', p_deposit_date)
  );
  perform public.write_audit('bank_deposit.recorded', 'bank_deposit', v_id, null,
    jsonb_build_object('amount_twd', p_amount_twd, 'deposit_date', p_deposit_date, 'closings', to_jsonb(p_closing_ids)));
  return v_id;
end;
$$;

-- Second person: staff, never the recorder; totals must match exactly.
create or replace function public.staff_reconcile_deposit(p_deposit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d public.bank_deposits%rowtype;
  v_total integer;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_d from public.bank_deposits where id = p_deposit_id for update;
  if v_d.id is null then
    raise exception 'deposit not found' using errcode = 'P0002';
  end if;
  if v_d.reconciled_at is not null then
    raise exception 'deposit already reconciled' using errcode = 'P0001';
  end if;
  if v_d.recorded_by = auth.uid() then
    raise exception 'cannot reconcile own deposit' using errcode = '42501';
  end if;

  select coalesce(sum(c.total_twd), 0)::integer into v_total
  from public.bank_deposit_closings dc
  join public.cash_closings c on c.id = dc.closing_id
  where dc.deposit_id = p_deposit_id;
  if v_total <> v_d.amount_twd then
    raise exception 'deposit amount does not match closings' using errcode = 'P0001';
  end if;

  update public.bank_deposits
  set reconciled_by = auth.uid(), reconciled_at = now()
  where id = p_deposit_id;

  perform public.close_task_by_key('deposit:' || p_deposit_id);
  perform public.write_audit('bank_deposit.reconciled', 'bank_deposit', p_deposit_id, null,
    jsonb_build_object('amount_twd', v_d.amount_twd, 'closings_total', v_total));
end;
$$;

-- 7. Reminders (hourly) ------------------------------------------------------------------------

create or replace function public.cash_reminders_sweep()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_opened integer := 0;
  v_now_taipei timestamp := now() at time zone 'Asia/Taipei';
begin
  -- Receipts still open at 22:00 Taipei (or from an earlier day).
  for v_row in
    select r.received_by, r.received_on, count(*)::integer as n, sum(r.amount_twd)::integer as total
    from public.cash_receipts r
    where r.closing_id is null
      and r.voided_at is null
      and (r.received_on < v_now_taipei::date
           or (r.received_on = v_now_taipei::date and v_now_taipei::time >= time '22:00'))
    group by r.received_by, r.received_on
  loop
    perform public.open_task(
      'cash.close_day', 'user', v_row.received_by,
      'cash_close:' || v_row.received_by || ':' || v_row.received_on, 'director', null,
      jsonb_build_object('date', v_row.received_on, 'receipt_count', v_row.n, 'total_twd', v_row.total)
    );
    v_opened := v_opened + 1;
  end loop;

  -- Closings with no deposit after 7 days.
  for v_row in
    select c.id, c.closing_date, c.total_twd
    from public.cash_closings c
    where not exists (select 1 from public.bank_deposit_closings dc where dc.closing_id = c.id)
      and c.closing_date <= v_now_taipei::date - 7
  loop
    perform public.open_task(
      'cash.deposit_due', 'cash_closing', v_row.id, 'cash_deposit:' || v_row.id, 'director', null,
      jsonb_build_object('date', v_row.closing_date, 'total_twd', v_row.total_twd)
    );
    v_opened := v_opened + 1;
  end loop;

  return v_opened;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'cash-reminders') then
      perform cron.unschedule('cash-reminders');
    end if;
    perform cron.schedule('cash-reminders', '23 * * * *', 'select public.cash_reminders_sweep()');
  else
    raise notice 'pg_cron not installed: cash_reminders_sweep is not scheduled';
  end if;
end;
$$;

-- 8. Grants -----------------------------------------------------------------------------------

revoke all on function public.can_handle_cash() from public, anon;
revoke all on function public.next_cash_receipt_no(date) from public, anon, authenticated;
revoke all on function public.cash_reminders_sweep() from public, anon, authenticated;
revoke all on function public.admin_set_director(uuid, boolean) from public, anon;
revoke all on function public.director_record_cash(uuid, uuid, integer, text, boolean, text, text) from public, anon;
revoke all on function public.director_void_cash_receipt(uuid, text) from public, anon;
revoke all on function public.director_close_cash_day(date) from public, anon;
revoke all on function public.director_record_deposit(date, integer, uuid[], text, text) from public, anon;
revoke all on function public.staff_reconcile_deposit(uuid) from public, anon;

grant execute on function public.can_handle_cash() to authenticated;
grant execute on function public.admin_set_director(uuid, boolean) to authenticated;
grant execute on function public.director_record_cash(uuid, uuid, integer, text, boolean, text, text) to authenticated;
grant execute on function public.director_void_cash_receipt(uuid, text) to authenticated;
grant execute on function public.director_close_cash_day(date) to authenticated;
grant execute on function public.director_record_deposit(date, integer, uuid[], text, text) to authenticated;
grant execute on function public.staff_reconcile_deposit(uuid) to authenticated;
