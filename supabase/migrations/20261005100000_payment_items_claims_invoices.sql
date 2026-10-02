-- Phase 1 PR-08a: payment items, the extended transfer report, invoices
-- (D12, D14 and the LINE OA "匯款回報" fields). Staging only. Do not run
-- against production.
--
-- * payment_items: what a family can pay for. Every session package has one
--   credit_package item kept in sync by a trigger; staff add the others
--   (kit, match fee, camp, other).
-- * payment_claims stays the table for transfer reports and gains: method,
--   transfer_date, amount_twd, item_id, invoice fields and an optional proof
--   screenshot in the private bucket payment-proofs. Only credit_package
--   claims add credits on approval; other items are recorded money only.
-- * invoices: an approved payment that needs an invoice opens a "to invoice"
--   task; recording the invoice number closes it (current invoicing stays
--   manual, D14).
-- * Parents can no longer insert claims straight into the table: the old
--   policy let a parent choose their own price and credit snapshot.

-- 1. Payment items ------------------------------------------------------------------

create table if not exists public.payment_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  name_i18n jsonb not null default '{}'::jsonb,
  price_twd integer,
  package_id uuid unique references public.session_packages (id) on delete restrict,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint payment_items_kind_check
    check (kind in ('credit_package', 'kit', 'match_fee', 'camp', 'other')),
  constraint payment_items_package_iff_credit
    check ((kind = 'credit_package') = (package_id is not null)),
  constraint payment_items_price_nonneg check (price_twd is null or price_twd >= 0),
  constraint payment_items_name_zh
    check (char_length(btrim(coalesce(name_i18n ->> 'zh-Hant', ''))) between 1 and 120)
);

comment on table public.payment_items is
  'What a family can pay for. credit_package items mirror session_packages (trigger); other kinds are staff-managed and never add credits.';

drop trigger if exists payment_items_set_updated_at on public.payment_items;
create trigger payment_items_set_updated_at
  before update on public.payment_items
  for each row
  execute function public.set_updated_at();

alter table public.payment_items enable row level security;
revoke all on table public.payment_items from public, anon;
grant select on table public.payment_items to authenticated;

drop policy if exists payment_items_select on public.payment_items;
create policy payment_items_select
  on public.payment_items
  for select
  to authenticated
  using (active or public.has_role('admin'));

create or replace function public.package_item_name(p_band public.package_age_band, p_credits integer)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'zh-Hant', case p_band when 'U8' then 'U8' else 'U10–U18' end || ' 堂數 ' || p_credits || ' 堂',
    'ja', case p_band when 'U8' then 'U8' else 'U10–U18' end || ' 回数券 ' || p_credits || ' 回',
    'en', case p_band when 'U8' then 'U8' else 'U10–U18' end || ' ' || p_credits || '-session pack'
  );
$$;

create or replace function public.sync_package_payment_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.payment_items (kind, name_i18n, price_twd, package_id, active, sort_order)
  values (
    'credit_package', public.package_item_name(new.age_band, new.credits), new.price_twd, new.id,
    new.active, new.credits
  )
  on conflict (package_id) do update
  set name_i18n = excluded.name_i18n,
      price_twd = excluded.price_twd,
      active = excluded.active,
      sort_order = excluded.sort_order;
  return new;
end;
$$;

drop trigger if exists session_packages_sync_payment_item on public.session_packages;
create trigger session_packages_sync_payment_item
  after insert or update on public.session_packages
  for each row
  execute function public.sync_package_payment_item();

insert into public.payment_items (kind, name_i18n, price_twd, package_id, active, sort_order)
select 'credit_package', public.package_item_name(p.age_band, p.credits), p.price_twd, p.id, p.active, p.credits
from public.session_packages p
on conflict (package_id) do nothing;

-- Staff-managed items (not credit packages).
create or replace function public.admin_upsert_payment_item(
  p_id uuid,
  p_kind text,
  p_name_zh text,
  p_name_ja text,
  p_name_en text,
  p_price_twd integer,
  p_active boolean,
  p_sort_order integer default 100
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_names jsonb;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('kit', 'match_fee', 'camp', 'other') then
    raise exception 'invalid item kind' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_name_zh, ''))) < 1 then
    raise exception 'item name required' using errcode = '22023';
  end if;
  if p_price_twd is not null and (p_price_twd < 0 or p_price_twd > 200000) then
    raise exception 'invalid price' using errcode = '22023';
  end if;

  v_names := jsonb_strip_nulls(jsonb_build_object(
    'zh-Hant', left(btrim(p_name_zh), 120),
    'ja', nullif(left(btrim(coalesce(p_name_ja, '')), 120), ''),
    'en', nullif(left(btrim(coalesce(p_name_en, '')), 120), '')
  ));

  if p_id is null then
    insert into public.payment_items (kind, name_i18n, price_twd, active, sort_order, created_by, updated_by)
    values (p_kind, v_names, p_price_twd, coalesce(p_active, true), coalesce(p_sort_order, 100), auth.uid(), auth.uid())
    returning id into v_id;
  else
    update public.payment_items
    set kind = p_kind, name_i18n = v_names, price_twd = p_price_twd,
        active = coalesce(p_active, active), sort_order = coalesce(p_sort_order, sort_order),
        updated_by = auth.uid()
    where id = p_id
      and kind <> 'credit_package'
    returning id into v_id;
    if v_id is null then
      raise exception 'item not found' using errcode = 'P0002';
    end if;
  end if;

  perform public.write_audit('payment_item.upsert', 'payment_item', v_id, null,
    jsonb_build_object('kind', p_kind, 'names', v_names, 'price_twd', p_price_twd, 'active', coalesce(p_active, true)));
  return v_id;
end;
$$;

-- 2. Claims: transfer report fields ------------------------------------------------------

drop policy if exists payment_claims_insert_own_pending on public.payment_claims;

alter table public.payment_claims
  add column if not exists method text not null default 'transfer',
  add column if not exists transfer_date date,
  add column if not exists amount_twd integer,
  add column if not exists item_id uuid references public.payment_items (id) on delete restrict,
  add column if not exists invoice_needed boolean not null default false,
  add column if not exists invoice_tax_id text,
  add column if not exists invoice_title text,
  add column if not exists screenshot_path text;

alter table public.payment_claims alter column package_id drop not null;
alter table public.payment_claims alter column credits_snapshot drop not null;

update public.payment_claims c
set item_id = i.id
from public.payment_items i
where i.package_id = c.package_id
  and c.item_id is null;
update public.payment_claims
set amount_twd = price_twd_snapshot
where amount_twd is null;

alter table public.payment_claims alter column item_id set not null;
alter table public.payment_claims alter column amount_twd set not null;

alter table public.payment_claims drop constraint if exists payment_claims_snapshot_values;
alter table public.payment_claims drop constraint if exists payment_claims_method_check;
alter table public.payment_claims drop constraint if exists payment_claims_amount_range;
alter table public.payment_claims drop constraint if exists payment_claims_invoice_fields;
alter table public.payment_claims drop constraint if exists payment_claims_screenshot_path;
alter table public.payment_claims
  add constraint payment_claims_snapshot_values check (
    price_twd_snapshot >= 0
    and ((package_id is null and credits_snapshot is null)
         or (package_id is not null and credits_snapshot > 0))
  ),
  add constraint payment_claims_method_check check (method in ('transfer', 'cash')),
  add constraint payment_claims_amount_range check (amount_twd between 0 and 200000),
  add constraint payment_claims_invoice_fields check (
    (invoice_tax_id is null or invoice_tax_id ~ '^[0-9]{8}$')
    and (invoice_title is null or char_length(invoice_title) <= 100)
    and (invoice_needed or (invoice_tax_id is null and invoice_title is null))
  ),
  add constraint payment_claims_screenshot_path check (
    screenshot_path is null
    or screenshot_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/proof-[0-9]+-[0-9a-f-]+\.(jpg|jpeg|png|webp)$'
  );

-- One open report per child and item (a kit payment no longer blocks a package).
drop index if exists public.payment_claims_open_player_idx;
create unique index if not exists payment_claims_open_player_item_idx
  on public.payment_claims (player_id, item_id)
  where status = 'pending';

comment on column public.payment_claims.amount_twd is
  'Amount the parent transferred. Credit packages: the package price snapshot. Other items: what the parent entered.';

-- 3. Proof screenshots (private bucket) -----------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists payment_proofs_select on storage.objects;
create policy payment_proofs_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      public.has_role('admin')
      or public.is_approved_guardian_for_player(public.player_id_from_storage_name(name))
    )
  );

drop policy if exists payment_proofs_insert on storage.objects;
create policy payment_proofs_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and public.is_approved_guardian_for_player(public.player_id_from_storage_name(name))
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/proof-[0-9]+-[0-9a-f-]+\.(jpg|jpeg|png|webp)$'
  );

drop policy if exists payment_proofs_delete on storage.objects;
create policy payment_proofs_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'payment-proofs' and public.has_role('admin'));

-- 4. Submit a transfer report -------------------------------------------------------------

create or replace function public.submit_payment_report(
  p_player_id uuid,
  p_item_id uuid,
  p_amount_twd integer,
  p_transfer_date date,
  p_last5 text,
  p_invoice_needed boolean default false,
  p_invoice_tax_id text default null,
  p_invoice_title text default null,
  p_screenshot_path text default null
)
returns uuid
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
  v_tax text;
  v_title text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_last5 is null or p_last5 !~ '^[0-9]{5}$' then
    raise exception 'invalid last5';
  end if;
  if not public.is_approved_guardian_for_player(p_player_id) then
    raise exception 'not an approved guardian';
  end if;
  if p_transfer_date is null
     or p_transfer_date > public.club_today()
     or p_transfer_date < public.club_today() - 90 then
    raise exception 'invalid transfer date' using errcode = '22023';
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
    v_credits := null;
  end if;

  if coalesce(p_invoice_needed, false) then
    v_tax := nullif(btrim(coalesce(p_invoice_tax_id, '')), '');
    if v_tax is not null and v_tax !~ '^[0-9]{8}$' then
      raise exception 'invalid tax id' using errcode = '22023';
    end if;
    v_title := nullif(left(btrim(coalesce(p_invoice_title, '')), 100), '');
  end if;

  if p_screenshot_path is not null then
    if public.player_id_from_storage_name(p_screenshot_path) is distinct from p_player_id
       or not exists (
         select 1 from storage.objects
         where bucket_id = 'payment-proofs' and name = p_screenshot_path
       ) then
      raise exception 'invalid screenshot path' using errcode = '22023';
    end if;
  end if;

  insert into public.payment_claims (
    player_id, guardian_user_id, package_id, item_id, last5, status, method,
    transfer_date, amount_twd, price_twd_snapshot, credits_snapshot,
    invoice_needed, invoice_tax_id, invoice_title, screenshot_path,
    created_by, updated_by
  )
  values (
    p_player_id, auth.uid(), v_item.package_id, v_item.id, p_last5, 'pending', 'transfer',
    p_transfer_date, v_amount, v_amount, v_credits,
    coalesce(p_invoice_needed, false), v_tax, v_title, p_screenshot_path,
    auth.uid(), auth.uid()
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'already has a pending claim';
end;
$$;

-- The original package-only RPC stays for existing callers: today's date, no invoice.
create or replace function public.submit_payment_claim(
  p_player_id uuid,
  p_package_id uuid,
  p_last5 text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item uuid;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_last5 is null or p_last5 !~ '^[0-9]{5}$' then
    raise exception 'invalid last5';
  end if;
  if not public.is_approved_guardian_for_player(p_player_id) then
    raise exception 'not an approved guardian';
  end if;
  select i.id into v_item
  from public.payment_items i
  join public.session_packages p on p.id = i.package_id
  where i.package_id = p_package_id and p.active;
  if v_item is null then
    raise exception 'package not found or inactive';
  end if;
  return public.submit_payment_report(p_player_id, v_item, null, public.club_today(), p_last5);
end;
$$;

-- 5. Invoices -------------------------------------------------------------------------------

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  payment_type text not null,
  payment_id uuid not null,
  player_id uuid references public.players (id) on delete set null,
  tax_id text,
  title text,
  amount_twd integer not null,
  invoice_no text,
  issued_at timestamptz,
  issued_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint invoices_payment_type_check check (payment_type in ('transfer_claim', 'cash_receipt')),
  constraint invoices_payment_unique unique (payment_type, payment_id),
  constraint invoices_tax_id_format check (tax_id is null or tax_id ~ '^[0-9]{8}$'),
  constraint invoices_issued_complete check ((invoice_no is null) = (issued_at is null))
);

comment on table public.invoices is
  'Invoices owed for approved payments (D14). invoice_no is recorded after the club issues it the usual way.';

alter table public.invoices enable row level security;
revoke all on table public.invoices from public, anon;
grant select on table public.invoices to authenticated;

drop policy if exists invoices_select_admin on public.invoices;
create policy invoices_select_admin
  on public.invoices
  for select
  to authenticated
  using (public.has_role('admin'));

create or replace function public.open_invoice_for_payment(
  p_payment_type text,
  p_payment_id uuid,
  p_player_id uuid,
  p_tax_id text,
  p_title text,
  p_amount_twd integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.invoices (payment_type, payment_id, player_id, tax_id, title, amount_twd)
  values (p_payment_type, p_payment_id, p_player_id, p_tax_id, p_title, p_amount_twd)
  on conflict (payment_type, payment_id) do nothing
  returning id into v_id;
  if v_id is not null then
    perform public.open_task(
      'invoice.pending', 'invoice', v_id, 'invoice:' || v_id, 'staff', null,
      jsonb_build_object('amount_twd', p_amount_twd, 'tax_id', p_tax_id, 'title', p_title, 'player_id', p_player_id)
    );
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_record_invoice(p_invoice_id uuid, p_invoice_no text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_no text := upper(btrim(coalesce(p_invoice_no, '')));
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_no !~ '^[A-Z0-9-]{2,20}$' then
    raise exception 'invalid invoice number' using errcode = '22023';
  end if;
  update public.invoices
  set invoice_no = v_no, issued_at = now(), issued_by = auth.uid()
  where id = p_invoice_id;
  if not found then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;
  perform public.close_task_by_key('invoice:' || p_invoice_id);
  perform public.write_audit('invoice.issued', 'invoice', p_invoice_id, null,
    jsonb_build_object('invoice_no', v_no));
end;
$$;

-- 6. Approval: credits only for credit packages; invoices when asked -----------------

create or replace function public.admin_review_payment_claim(
  p_claim_id uuid,
  p_status public.payment_claim_status,
  p_admin_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.payment_claims%rowtype;
  v_bal public.player_session_balances%rowtype;
  v_unit numeric(12, 4);
  v_new_avg numeric(12, 4);
  v_note text;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'invalid decision';
  end if;

  v_note := nullif(btrim(coalesce(p_admin_note, '')), '');
  if v_note is not null then
    v_note := left(v_note, 1000);
  end if;

  select * into v_claim
  from public.payment_claims
  where id = p_claim_id
  for update;
  if not found or v_claim.status is distinct from 'pending' then
    raise exception 'claim not found or not pending';
  end if;

  update public.payment_claims
  set
    status = p_status,
    admin_note = v_note,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_by = auth.uid()
  where id = p_claim_id;

  if p_status = 'rejected' then
    return p_claim_id;
  end if;

  if v_claim.invoice_needed then
    perform public.open_invoice_for_payment(
      'transfer_claim', v_claim.id, v_claim.player_id, v_claim.invoice_tax_id,
      v_claim.invoice_title, v_claim.amount_twd
    );
  end if;

  -- Kit, match fee, camp, other: money recorded, credit wallet untouched.
  if v_claim.package_id is null then
    return p_claim_id;
  end if;

  perform public.ensure_player_session_balance(v_claim.player_id);

  select * into v_bal
  from public.player_session_balances
  where player_id = v_claim.player_id
  for update;

  v_unit := (v_claim.price_twd_snapshot::numeric / v_claim.credits_snapshot::numeric);
  if v_bal.credits_available <= 0 then
    v_new_avg := v_unit;
  else
    v_new_avg := (
      (v_bal.credits_available::numeric * v_bal.avg_unit_cost_twd)
      + (v_claim.credits_snapshot::numeric * v_unit)
    ) / (v_bal.credits_available + v_claim.credits_snapshot)::numeric;
  end if;

  update public.player_session_balances
  set
    credits_available = credits_available + v_claim.credits_snapshot,
    avg_unit_cost_twd = v_new_avg,
    updated_by = auth.uid()
  where player_id = v_claim.player_id;

  insert into public.session_credit_ledger (
    player_id, entry_type, amount, unit_cost_twd, amount_twd,
    package_id, claim_id, actor_user_id, reason
  )
  values (
    v_claim.player_id, 'purchase', v_claim.credits_snapshot, v_unit, v_claim.price_twd_snapshot,
    v_claim.package_id, v_claim.id, auth.uid(), 'payment claim approved'
  );

  return p_claim_id;
end;
$$;

-- 7. Grants ------------------------------------------------------------------------------------

revoke all on function public.package_item_name(public.package_age_band, integer) from public, anon;
revoke all on function public.sync_package_payment_item() from public, anon, authenticated;
revoke all on function public.open_invoice_for_payment(text, uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.admin_upsert_payment_item(uuid, text, text, text, text, integer, boolean, integer) from public, anon;
revoke all on function public.submit_payment_report(uuid, uuid, integer, date, text, boolean, text, text, text) from public, anon;
revoke all on function public.submit_payment_claim(uuid, uuid, text) from public, anon;
revoke all on function public.admin_record_invoice(uuid, text) from public, anon;
revoke all on function public.admin_review_payment_claim(uuid, public.payment_claim_status, text) from public, anon;

grant execute on function public.admin_upsert_payment_item(uuid, text, text, text, text, integer, boolean, integer) to authenticated;
grant execute on function public.submit_payment_report(uuid, uuid, integer, date, text, boolean, text, text, text) to authenticated;
grant execute on function public.submit_payment_claim(uuid, uuid, text) to authenticated;
grant execute on function public.admin_record_invoice(uuid, text) to authenticated;
grant execute on function public.admin_review_payment_claim(uuid, public.payment_claim_status, text) to authenticated;
