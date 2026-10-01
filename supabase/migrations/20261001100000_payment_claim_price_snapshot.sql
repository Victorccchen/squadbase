-- Phase 1 PR-01: payment claims keep the price and credits the parent paid for.
--
-- Before this migration a claim stored only package_id. Approval and the admin
-- revenue figures read the package's current price, so editing a package price
-- rewrote history and could credit a pending claim on the new terms.
--
-- After this migration:
--   * payment_claims.price_twd_snapshot / credits_snapshot are set on submit
--     and used on approval.
--   * A package that has any claim cannot change age_band, credits or price;
--     deactivate it and add a new package instead (enforced by trigger, so it
--     also covers direct table writes under the admin RLS policy).
--   * Only one active package per (age_band, credits); inactive ones may repeat.
--
-- Apply on staging only.

-- 1. Snapshot columns ---------------------------------------------------------

alter table public.payment_claims
  add column if not exists price_twd_snapshot integer,
  add column if not exists credits_snapshot integer;

-- Approved claims: use what the ledger actually credited.
update public.payment_claims c
set
  price_twd_snapshot = round(l.amount_twd)::integer,
  credits_snapshot = l.amount
from public.session_credit_ledger l
where l.claim_id = c.id
  and l.entry_type = 'purchase'
  and (c.price_twd_snapshot is null or c.credits_snapshot is null);

-- Pending / rejected claims (and any approved claim without a ledger row):
-- best available value is the package as it is today.
update public.payment_claims c
set
  price_twd_snapshot = coalesce(c.price_twd_snapshot, p.price_twd),
  credits_snapshot = coalesce(c.credits_snapshot, p.credits)
from public.session_packages p
where p.id = c.package_id
  and (c.price_twd_snapshot is null or c.credits_snapshot is null);

alter table public.payment_claims
  alter column price_twd_snapshot set not null,
  alter column credits_snapshot set not null;

alter table public.payment_claims
  drop constraint if exists payment_claims_snapshot_values;
alter table public.payment_claims
  add constraint payment_claims_snapshot_values
  check (price_twd_snapshot >= 0 and credits_snapshot > 0);

comment on column public.payment_claims.price_twd_snapshot is
  'Package price (TWD) when the parent submitted the claim. Approval and revenue use this, never the live package price.';
comment on column public.payment_claims.credits_snapshot is
  'Package credits when the parent submitted the claim.';

-- 2. One active package per band and credit count ----------------------------

alter table public.session_packages
  drop constraint if exists session_packages_band_credits_unique;

create unique index if not exists session_packages_active_band_credits_idx
  on public.session_packages (age_band, credits)
  where active;

-- 3. Freeze package terms once a claim exists --------------------------------

create or replace function public.session_packages_freeze_claimed_terms()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    new.age_band is distinct from old.age_band
    or new.credits is distinct from old.credits
    or new.price_twd is distinct from old.price_twd
  ) and exists (
    select 1 from public.payment_claims c where c.package_id = old.id
  ) then
    raise exception 'package has claims'
      using errcode = 'P0001',
            hint = 'Deactivate this package and add a new one with the new price.';
  end if;
  return new;
end;
$$;

revoke all on function public.session_packages_freeze_claimed_terms() from public, anon, authenticated;

drop trigger if exists session_packages_freeze_claimed_terms on public.session_packages;
create trigger session_packages_freeze_claimed_terms
  before update on public.session_packages
  for each row
  execute function public.session_packages_freeze_claimed_terms();

-- 4. Submit: store the snapshot ----------------------------------------------

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
  v_id uuid;
  v_pkg public.session_packages%rowtype;
  v_band public.package_age_band;
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

  select * into v_pkg
  from public.session_packages
  where id = p_package_id
    and active = true;
  if not found then
    raise exception 'package not found or inactive';
  end if;

  v_band := public.player_team_catalog_band(p_player_id);
  if v_band is null then
    raise exception 'credits do not apply to this age band';
  end if;
  if v_band is distinct from v_pkg.age_band then
    raise exception 'package band mismatch';
  end if;

  insert into public.payment_claims (
    player_id,
    guardian_user_id,
    package_id,
    last5,
    status,
    price_twd_snapshot,
    credits_snapshot,
    created_by,
    updated_by
  )
  values (
    p_player_id,
    auth.uid(),
    p_package_id,
    p_last5,
    'pending',
    v_pkg.price_twd,
    v_pkg.credits,
    auth.uid(),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'already has a pending claim';
end;
$$;

-- 5. Approve: credit the snapshot, not the live package ----------------------

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

  perform public.ensure_player_session_balance(v_claim.player_id);

  select * into v_bal
  from public.player_session_balances
  where player_id = v_claim.player_id
  for update;

  v_unit := (v_claim.price_twd_snapshot::numeric / v_claim.credits_snapshot::numeric);
  if v_bal.credits_available = 0 then
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
    player_id,
    entry_type,
    amount,
    unit_cost_twd,
    amount_twd,
    package_id,
    claim_id,
    actor_user_id,
    reason
  )
  values (
    v_claim.player_id,
    'purchase',
    v_claim.credits_snapshot,
    v_unit,
    v_claim.price_twd_snapshot,
    v_claim.package_id,
    v_claim.id,
    auth.uid(),
    'payment claim approved'
  );

  return p_claim_id;
end;
$$;

-- 6. Package upsert: clearer duplicate error ---------------------------------

create or replace function public.admin_upsert_session_package(
  p_id uuid,
  p_age_band public.package_age_band,
  p_credits integer,
  p_price_twd integer,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_credits is null or p_credits <= 0 then
    raise exception 'invalid credit amount';
  end if;
  if p_price_twd is null or p_price_twd < 0 then
    raise exception 'invalid price';
  end if;

  begin
    if p_id is null then
      insert into public.session_packages (
        age_band, credits, price_twd, active, created_by, updated_by
      )
      values (
        p_age_band, p_credits, p_price_twd, coalesce(p_active, true), auth.uid(), auth.uid()
      )
      returning id into v_id;
      return v_id;
    end if;

    update public.session_packages
    set
      age_band = p_age_band,
      credits = p_credits,
      price_twd = p_price_twd,
      active = coalesce(p_active, active),
      updated_by = auth.uid()
    where id = p_id
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'active package already exists';
  end;

  if v_id is null then
    raise exception 'package not found or inactive';
  end if;
  return v_id;
end;
$$;

-- 7. Privileges (same as Stage 4B) -------------------------------------------

revoke all on function public.submit_payment_claim(uuid, uuid, text) from public, anon;
grant execute on function public.submit_payment_claim(uuid, uuid, text) to authenticated;

revoke all on function public.admin_review_payment_claim(uuid, public.payment_claim_status, text) from public, anon;
grant execute on function public.admin_review_payment_claim(uuid, public.payment_claim_status, text) to authenticated;

revoke all on function public.admin_upsert_session_package(uuid, public.package_age_band, integer, integer, boolean) from public, anon;
grant execute on function public.admin_upsert_session_package(uuid, public.package_age_band, integer, integer, boolean) to authenticated;
