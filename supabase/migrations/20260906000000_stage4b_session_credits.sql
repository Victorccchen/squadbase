-- Stage 4B: prepaid session credits, bank-transfer claims, attendance debit,
-- excused leave, and club transfer-hint settings.
-- Apply to the staging project only. Do not run against production.
--
-- Paste this file's CONTENTS in the staging SQL Editor (not a path string).
--
-- Does not change Stage 4 / 4A / 4A.1 session title, kinds, multi-weekday
-- series, calendar, soft-delete, auto-approve registration, or Q&A.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'package_age_band' and n.nspname = 'public'
  ) then
    create type public.package_age_band as enum ('U8', 'U10_U18');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'payment_claim_status' and n.nspname = 'public'
  ) then
    create type public.payment_claim_status as enum ('pending', 'approved', 'rejected');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'attendance_status' and n.nspname = 'public'
  ) then
    create type public.attendance_status as enum (
      'present',
      'excused_absent',
      'unexcused_absent'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'credit_ledger_entry_type' and n.nspname = 'public'
  ) then
    create type public.credit_ledger_entry_type as enum (
      'purchase',
      'attend_debit',
      'no_show_debit',
      'match_debit',
      'admin_adjust',
      'reversal'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'leave_request_status' and n.nspname = 'public'
  ) then
    create type public.leave_request_status as enum ('pending', 'approved', 'rejected');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Session debit overrides (edge cases). Defaults keep 4A behaviour.
-- ---------------------------------------------------------------------------

alter table public.training_sessions
  add column if not exists no_debit boolean not null default false;

alter table public.training_sessions
  add column if not exists debit_override_n integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'training_sessions_debit_override_n_nonneg'
  ) then
    alter table public.training_sessions
      add constraint training_sessions_debit_override_n_nonneg
      check (debit_override_n is null or debit_override_n >= 0);
  end if;
end
$$;

comment on column public.training_sessions.no_debit is
  'Admin edge-case: force 0 credit debit regardless of kind. U6/reserve/senior still never debit.';
comment on column public.training_sessions.debit_override_n is
  'Admin edge-case: debit this many credits instead of the kind default. Ignored when no_debit.';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.session_packages (
  id uuid primary key default gen_random_uuid(),
  age_band public.package_age_band not null,
  credits integer not null,
  price_twd integer not null,
  active boolean not null default true,
  effective_from date not null default date '2026-09-01',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint session_packages_credits_positive check (credits > 0),
  constraint session_packages_price_nonneg check (price_twd >= 0),
  constraint session_packages_band_credits_unique unique (age_band, credits)
);

create table if not exists public.player_session_balances (
  player_id uuid primary key references public.players (id) on delete restrict,
  credits_available integer not null default 0,
  avg_unit_cost_twd numeric(12, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  constraint player_session_balances_credits_nonneg check (credits_available >= 0),
  constraint player_session_balances_unit_nonneg check (avg_unit_cost_twd >= 0)
);

create table if not exists public.payment_claims (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete restrict,
  guardian_user_id uuid not null references public.profiles (id) on delete cascade,
  package_id uuid not null references public.session_packages (id) on delete restrict,
  last5 text not null,
  status public.payment_claim_status not null default 'pending',
  admin_note text,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint payment_claims_last5_digits check (last5 ~ '^[0-9]{5}$'),
  constraint payment_claims_admin_note_length
    check (admin_note is null or char_length(admin_note) <= 1000)
);

create unique index if not exists payment_claims_open_player_idx
  on public.payment_claims (player_id)
  where status = 'pending';

create table if not exists public.session_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete restrict,
  entry_type public.credit_ledger_entry_type not null,
  amount integer not null,
  unit_cost_twd numeric(12, 4),
  amount_twd numeric(14, 4),
  package_id uuid references public.session_packages (id) on delete restrict,
  claim_id uuid references public.payment_claims (id) on delete restrict,
  session_id uuid references public.training_sessions (id) on delete restrict,
  attendance_id uuid,
  actor_user_id uuid references auth.users (id),
  reason text,
  created_at timestamptz not null default now(),
  constraint session_credit_ledger_amount_nonzero check (amount <> 0),
  constraint session_credit_ledger_reason_length
    check (reason is null or char_length(reason) <= 500)
);

create table if not exists public.session_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  status public.attendance_status not null,
  credits_debited integer not null default 0,
  marked_by uuid references auth.users (id),
  marked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint session_attendance_pair unique (session_id, player_id),
  constraint session_attendance_credits_debited_nonneg check (credits_debited >= 0)
);

alter table public.session_credit_ledger
  drop constraint if exists session_credit_ledger_attendance_id_fkey;
alter table public.session_credit_ledger
  add constraint session_credit_ledger_attendance_id_fkey
  foreign key (attendance_id) references public.session_attendance (id) on delete restrict;

create table if not exists public.session_leave_requests (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.session_registrations (id) on delete cascade,
  status public.leave_request_status not null default 'pending',
  parent_note text,
  admin_note text,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint session_leave_requests_parent_note_length
    check (parent_note is null or char_length(parent_note) <= 1000),
  constraint session_leave_requests_admin_note_length
    check (admin_note is null or char_length(admin_note) <= 1000)
);

create unique index if not exists session_leave_requests_open_idx
  on public.session_leave_requests (registration_id)
  where status in ('pending', 'approved');

create table if not exists public.club_runtime_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  constraint club_runtime_settings_allowed_keys
    check (key in ('bank_transfer_hint')),
  constraint club_runtime_settings_value_length check (char_length(value) <= 2000)
);

create index if not exists payment_claims_status_idx
  on public.payment_claims (status, created_at);
create index if not exists payment_claims_guardian_idx
  on public.payment_claims (guardian_user_id);
create index if not exists session_credit_ledger_player_idx
  on public.session_credit_ledger (player_id, created_at);
create index if not exists session_credit_ledger_session_idx
  on public.session_credit_ledger (session_id);
create index if not exists session_attendance_session_idx
  on public.session_attendance (session_id);
create index if not exists session_attendance_player_idx
  on public.session_attendance (player_id);
create index if not exists session_leave_requests_registration_idx
  on public.session_leave_requests (registration_id);

comment on table public.session_packages is
  'Admin-maintainable prepaid package catalog. Seeded TWD prices from 2026-09-01. No bank secrets.';
comment on table public.player_session_balances is
  'Remaining prepaid session credits per player. Parents see this, not the money ledger.';
comment on table public.session_credit_ledger is
  'Immutable credit movements for later contribution reports. Admin select only.';
comment on table public.payment_claims is
  'Parent bank-transfer claims with last-5 digits. Admin approves to credit the balance.';
comment on table public.session_attendance is
  'One attendance row per (session, player). Debit is applied by mark_session_attendance.';
comment on table public.session_leave_requests is
  'Parent excused-leave request on a registration. Pending until admin approves.';
comment on table public.club_runtime_settings is
  'Admin-editable non-secret runtime copy (bank transfer hint). Never store tokens or account numbers in git.';

-- Seed catalog (idempotent). 1-packs exist for display; buy UI prefers 10/20/30.
insert into public.session_packages (age_band, credits, price_twd, active, effective_from)
values
  ('U8', 1, 350, true, date '2026-09-01'),
  ('U8', 10, 3500, true, date '2026-09-01'),
  ('U8', 20, 7000, true, date '2026-09-01'),
  ('U8', 30, 10000, true, date '2026-09-01'),
  ('U10_U18', 1, 500, true, date '2026-09-01'),
  ('U10_U18', 10, 4800, true, date '2026-09-01'),
  ('U10_U18', 20, 9000, true, date '2026-09-01'),
  ('U10_U18', 30, 12000, true, date '2026-09-01')
on conflict (age_band, credits) do update
set
  price_twd = excluded.price_twd,
  effective_from = excluded.effective_from,
  updated_at = now();

insert into public.club_runtime_settings (key, value)
values ('bank_transfer_hint', '')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

drop trigger if exists session_packages_set_updated_at on public.session_packages;
create trigger session_packages_set_updated_at
  before update on public.session_packages
  for each row
  execute function public.set_updated_at();

drop trigger if exists session_packages_set_actor_columns on public.session_packages;
create trigger session_packages_set_actor_columns
  before insert or update on public.session_packages
  for each row
  execute function public.set_actor_columns();

drop trigger if exists player_session_balances_set_updated_at on public.player_session_balances;
create trigger player_session_balances_set_updated_at
  before update on public.player_session_balances
  for each row
  execute function public.set_updated_at();

drop trigger if exists payment_claims_set_updated_at on public.payment_claims;
create trigger payment_claims_set_updated_at
  before update on public.payment_claims
  for each row
  execute function public.set_updated_at();

drop trigger if exists payment_claims_set_actor_columns on public.payment_claims;
create trigger payment_claims_set_actor_columns
  before insert or update on public.payment_claims
  for each row
  execute function public.set_actor_columns();

drop trigger if exists session_attendance_set_updated_at on public.session_attendance;
create trigger session_attendance_set_updated_at
  before update on public.session_attendance
  for each row
  execute function public.set_updated_at();

drop trigger if exists session_attendance_set_actor_columns on public.session_attendance;
create trigger session_attendance_set_actor_columns
  before insert or update on public.session_attendance
  for each row
  execute function public.set_actor_columns();

drop trigger if exists session_leave_requests_set_updated_at on public.session_leave_requests;
create trigger session_leave_requests_set_updated_at
  before update on public.session_leave_requests
  for each row
  execute function public.set_updated_at();

drop trigger if exists session_leave_requests_set_actor_columns on public.session_leave_requests;
create trigger session_leave_requests_set_actor_columns
  before insert or update on public.session_leave_requests
  for each row
  execute function public.set_actor_columns();

create or replace function public.session_credit_ledger_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'session_credit_ledger is immutable';
end;
$$;

drop trigger if exists session_credit_ledger_no_update on public.session_credit_ledger;
create trigger session_credit_ledger_no_update
  before update or delete on public.session_credit_ledger
  for each row
  execute function public.session_credit_ledger_immutable();

-- ---------------------------------------------------------------------------
-- Helpers (pure / SQL)
-- ---------------------------------------------------------------------------

create or replace function public.catalog_band_from_team_age_band(
  p_age_band public.age_band
)
returns public.package_age_band
language sql
immutable
as $$
  select case
    when p_age_band = 'U8' then 'U8'::public.package_age_band
    when p_age_band in ('U10', 'U12', 'U15', 'U18') then 'U10_U18'::public.package_age_band
    else null
  end;
$$;

create or replace function public.credits_apply_to_age_band(p_age_band public.age_band)
returns boolean
language sql
immutable
as $$
  select public.catalog_band_from_team_age_band(p_age_band) is not null;
$$;

create or replace function public.club_session_date(p_at timestamptz)
returns date
language sql
immutable
as $$
  select timezone('Asia/Taipei', p_at)::date;
$$;

create or replace function public.compute_session_debit_plan(
  p_kind public.session_kind,
  p_team_age_band public.age_band,
  p_attendance_status public.attendance_status,
  p_no_debit boolean,
  p_debit_override_n integer,
  p_excused_leave_approved boolean,
  p_already_debited_same_match_day boolean
)
returns table (
  credits integer,
  entry_type public.credit_ledger_entry_type,
  no_debit_label boolean
)
language plpgsql
immutable
as $$
declare
  v_entry public.credit_ledger_entry_type;
begin
  if p_team_age_band is null
     or not public.credits_apply_to_age_band(p_team_age_band)
     or coalesce(p_no_debit, false) then
    credits := 0;
    entry_type := null;
    no_debit_label := true;
    return next;
    return;
  end if;

  if coalesce(p_excused_leave_approved, false)
     or p_attendance_status = 'excused_absent' then
    credits := 0;
    entry_type := null;
    no_debit_label := false;
    return next;
    return;
  end if;

  if p_kind in ('cup', 'league') then
    v_entry := 'match_debit';
  elsif p_attendance_status = 'unexcused_absent' then
    v_entry := 'no_show_debit';
  else
    v_entry := 'attend_debit';
  end if;

  if p_debit_override_n is not null then
    if p_debit_override_n < 0 then
      credits := 0;
      entry_type := null;
      no_debit_label := false;
      return next;
      return;
    end if;
    if p_debit_override_n = 0 then
      credits := 0;
      entry_type := null;
      no_debit_label := true;
      return next;
      return;
    end if;
    if p_kind in ('cup', 'league') and coalesce(p_already_debited_same_match_day, false) then
      credits := 0;
      entry_type := null;
      no_debit_label := false;
      return next;
      return;
    end if;
    credits := p_debit_override_n;
    entry_type := v_entry;
    no_debit_label := false;
    return next;
    return;
  end if;

  if p_kind = 'regular' then
    if p_attendance_status in ('present', 'unexcused_absent') then
      credits := 1;
      entry_type := v_entry;
      no_debit_label := false;
    else
      credits := 0;
      entry_type := null;
      no_debit_label := false;
    end if;
    return next;
    return;
  end if;

  if p_kind = 'special' then
    if p_attendance_status in ('present', 'unexcused_absent') then
      credits := 2;
      entry_type := v_entry;
      no_debit_label := false;
    else
      credits := 0;
      entry_type := null;
      no_debit_label := false;
    end if;
    return next;
    return;
  end if;

  if coalesce(p_already_debited_same_match_day, false) then
    credits := 0;
    entry_type := null;
    no_debit_label := false;
    return next;
    return;
  end if;

  if p_attendance_status in ('present', 'unexcused_absent') then
    credits := 1;
    entry_type := 'match_debit';
    no_debit_label := false;
  else
    credits := 0;
    entry_type := null;
    no_debit_label := false;
  end if;
  return next;
end;
$$;

create or replace function public.ensure_player_session_balance(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.player_session_balances (player_id, credits_available)
  values (p_player_id, 0)
  on conflict (player_id) do nothing;
end;
$$;

create or replace function public.player_active_on_session_team(
  p_player_id uuid,
  p_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships m
    where m.player_id = p_player_id
      and m.team_id = p_team_id
      and m.status = 'active'
  );
$$;

create or replace function public.player_team_catalog_band(p_player_id uuid)
returns public.package_age_band
language sql
stable
security definer
set search_path = public
as $$
  select public.catalog_band_from_team_age_band(t.age_band)
  from public.team_memberships m
  join public.teams t on t.id = m.team_id
  where m.player_id = p_player_id
    and m.status = 'active'
  order by m.updated_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

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
    created_by,
    updated_by
  )
  values (
    p_player_id,
    auth.uid(),
    p_package_id,
    p_last5,
    'pending',
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
  v_pkg public.session_packages%rowtype;
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

  select * into v_pkg
  from public.session_packages
  where id = v_claim.package_id;
  if not found then
    raise exception 'package not found or inactive';
  end if;

  perform public.ensure_player_session_balance(v_claim.player_id);

  select * into v_bal
  from public.player_session_balances
  where player_id = v_claim.player_id
  for update;

  v_unit := (v_pkg.price_twd::numeric / v_pkg.credits::numeric);
  if v_bal.credits_available = 0 then
    v_new_avg := v_unit;
  else
    v_new_avg := (
      (v_bal.credits_available::numeric * v_bal.avg_unit_cost_twd)
      + (v_pkg.credits::numeric * v_unit)
    ) / (v_bal.credits_available + v_pkg.credits)::numeric;
  end if;

  update public.player_session_balances
  set
    credits_available = credits_available + v_pkg.credits,
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
    v_pkg.credits,
    v_unit,
    v_pkg.price_twd,
    v_pkg.id,
    v_claim.id,
    auth.uid(),
    'payment claim approved'
  );

  return p_claim_id;
end;
$$;

create or replace function public.admin_adjust_session_credits(
  p_player_id uuid,
  p_amount integer,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal public.player_session_balances%rowtype;
  v_reason text;
  v_id uuid;
  v_new_avg numeric(12, 4);
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'invalid credit amount';
  end if;
  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 3 then
    raise exception 'reason required';
  end if;
  v_reason := left(v_reason, 500);

  perform public.ensure_player_session_balance(p_player_id);

  select * into v_bal
  from public.player_session_balances
  where player_id = p_player_id
  for update;

  if v_bal.credits_available + p_amount < 0 then
    raise exception 'adjust would be negative';
  end if;

  v_new_avg := v_bal.avg_unit_cost_twd;
  if p_amount > 0 and v_bal.credits_available = 0 and v_new_avg = 0 then
    v_new_avg := 0;
  end if;

  update public.player_session_balances
  set
    credits_available = credits_available + p_amount,
    avg_unit_cost_twd = v_new_avg,
    updated_by = auth.uid()
  where player_id = p_player_id;

  insert into public.session_credit_ledger (
    player_id,
    entry_type,
    amount,
    unit_cost_twd,
    amount_twd,
    actor_user_id,
    reason
  )
  values (
    p_player_id,
    'admin_adjust',
    p_amount,
    v_new_avg,
    abs(p_amount)::numeric * v_new_avg,
    auth.uid(),
    v_reason
  )
  returning id into v_id;

  return v_id;
end;
$$;

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

  if v_id is null then
    raise exception 'package not found or inactive';
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_set_session_debit_override(
  p_session_id uuid,
  p_no_debit boolean,
  p_debit_override_n integer
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
  if p_debit_override_n is not null and p_debit_override_n < 0 then
    raise exception 'invalid credit amount';
  end if;

  update public.training_sessions
  set
    no_debit = coalesce(p_no_debit, false),
    debit_override_n = p_debit_override_n,
    updated_by = auth.uid()
  where id = p_session_id
    and deleted_at is null
  returning id into v_id;

  if v_id is null then
    raise exception 'session not found';
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_set_club_setting(
  p_key text,
  p_value text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_key is distinct from 'bank_transfer_hint' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.club_runtime_settings (key, value, updated_by)
  values (p_key, left(coalesce(p_value, ''), 2000), auth.uid())
  on conflict (key) do update
  set
    value = excluded.value,
    updated_by = auth.uid(),
    updated_at = now();

  return p_key;
end;
$$;

create or replace function public.request_excused_leave(
  p_registration_id uuid,
  p_parent_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg public.session_registrations%rowtype;
  v_id uuid;
  v_note text;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_reg
  from public.session_registrations
  where id = p_registration_id;
  if not found or v_reg.status is distinct from 'registered' then
    raise exception 'registration not found';
  end if;
  if not public.is_approved_guardian_for_player(v_reg.player_id) then
    raise exception 'not an approved guardian';
  end if;

  v_note := nullif(btrim(coalesce(p_parent_note, '')), '');
  if v_note is not null then
    v_note := left(v_note, 1000);
  end if;

  insert into public.session_leave_requests (
    registration_id,
    status,
    parent_note,
    created_by,
    updated_by
  )
  values (
    p_registration_id,
    'pending',
    v_note,
    auth.uid(),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'already has a pending leave request';
end;
$$;

create or replace function public.staff_review_leave_request(
  p_request_id uuid,
  p_status public.leave_request_status,
  p_admin_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.session_leave_requests%rowtype;
  v_note text;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'invalid decision';
  end if;

  select * into v_req
  from public.session_leave_requests
  where id = p_request_id
  for update;
  if not found or v_req.status is distinct from 'pending' then
    raise exception 'leave request not found or not pending';
  end if;

  v_note := nullif(btrim(coalesce(p_admin_note, '')), '');
  if v_note is not null then
    v_note := left(v_note, 1000);
  end if;

  update public.session_leave_requests
  set
    status = p_status,
    admin_note = v_note,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_by = auth.uid()
  where id = p_request_id;

  return p_request_id;
end;
$$;

create or replace function public.mark_session_attendance(
  p_session_id uuid,
  p_player_id uuid,
  p_status public.attendance_status
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.training_sessions%rowtype;
  v_team public.teams%rowtype;
  v_existing public.session_attendance%rowtype;
  v_bal public.player_session_balances%rowtype;
  v_plan record;
  v_status public.attendance_status;
  v_leave_approved boolean;
  v_already_match boolean;
  v_id uuid;
  v_actor uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_session
  from public.training_sessions
  where id = p_session_id
  for update;
  if not found or v_session.deleted_at is not null then
    raise exception 'session not found';
  end if;

  if not (
    public.has_role('admin')
    or (
      public.has_role('coach')
      and public.is_assigned_coach_for_team(v_session.team_id)
    )
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not public.player_active_on_session_team(p_player_id, v_session.team_id) then
    raise exception 'player is not on this session team';
  end if;

  select * into v_team from public.teams where id = v_session.team_id;

  v_leave_approved := exists (
    select 1
    from public.session_registrations r
    join public.session_leave_requests l on l.registration_id = r.id
    where r.session_id = p_session_id
      and r.player_id = p_player_id
      and r.status = 'registered'
      and l.status = 'approved'
  );

  v_status := p_status;
  if v_leave_approved then
    v_status := 'excused_absent';
  end if;

  select * into v_existing
  from public.session_attendance
  where session_id = p_session_id
    and player_id = p_player_id
  for update;

  perform public.ensure_player_session_balance(p_player_id);
  select * into v_bal
  from public.player_session_balances
  where player_id = p_player_id
  for update;

  if v_existing.id is not null and v_existing.credits_debited > 0 then
    update public.player_session_balances
    set
      credits_available = credits_available + v_existing.credits_debited,
      updated_by = v_actor
    where player_id = p_player_id;

    insert into public.session_credit_ledger (
      player_id,
      entry_type,
      amount,
      unit_cost_twd,
      amount_twd,
      session_id,
      attendance_id,
      actor_user_id,
      reason
    )
    values (
      p_player_id,
      'reversal',
      v_existing.credits_debited,
      v_bal.avg_unit_cost_twd,
      v_existing.credits_debited::numeric * v_bal.avg_unit_cost_twd,
      p_session_id,
      v_existing.id,
      v_actor,
      'attendance change reversal'
    );

    select * into v_bal
    from public.player_session_balances
    where player_id = p_player_id;
  end if;

  v_already_match := exists (
    select 1
    from public.session_credit_ledger l
    join public.training_sessions s on s.id = l.session_id
    where l.player_id = p_player_id
      and l.entry_type = 'match_debit'
      and l.session_id is distinct from p_session_id
      and public.club_session_date(s.starts_at) = public.club_session_date(v_session.starts_at)
  );

  select * into v_plan
  from public.compute_session_debit_plan(
    v_session.kind,
    v_team.age_band,
    v_status,
    v_session.no_debit,
    v_session.debit_override_n,
    v_leave_approved,
    v_already_match
  );

  if v_plan.credits > 0 and v_bal.credits_available < v_plan.credits then
    raise exception 'insufficient credits';
  end if;

  if v_existing.id is null then
    insert into public.session_attendance (
      session_id,
      player_id,
      status,
      credits_debited,
      marked_by,
      marked_at,
      created_by,
      updated_by
    )
    values (
      p_session_id,
      p_player_id,
      v_status,
      v_plan.credits,
      v_actor,
      now(),
      v_actor,
      v_actor
    )
    returning id into v_id;
  else
    update public.session_attendance
    set
      status = v_status,
      credits_debited = v_plan.credits,
      marked_by = v_actor,
      marked_at = now(),
      updated_by = v_actor
    where id = v_existing.id
    returning id into v_id;
  end if;

  if v_plan.credits > 0 then
    update public.player_session_balances
    set
      credits_available = credits_available - v_plan.credits,
      updated_by = v_actor
    where player_id = p_player_id;

    insert into public.session_credit_ledger (
      player_id,
      entry_type,
      amount,
      unit_cost_twd,
      amount_twd,
      session_id,
      attendance_id,
      actor_user_id,
      reason
    )
    values (
      p_player_id,
      v_plan.entry_type,
      -v_plan.credits,
      v_bal.avg_unit_cost_twd,
      v_plan.credits::numeric * v_bal.avg_unit_cost_twd,
      p_session_id,
      v_id,
      v_actor,
      'attendance debit'
    );
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.session_packages enable row level security;
alter table public.player_session_balances enable row level security;
alter table public.payment_claims enable row level security;
alter table public.session_credit_ledger enable row level security;
alter table public.session_attendance enable row level security;
alter table public.session_leave_requests enable row level security;
alter table public.club_runtime_settings enable row level security;

drop policy if exists session_packages_select_authenticated on public.session_packages;
create policy session_packages_select_authenticated
  on public.session_packages
  for select
  to authenticated
  using (true);

drop policy if exists session_packages_admin_write on public.session_packages;
create policy session_packages_admin_write
  on public.session_packages
  for all
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists player_session_balances_select on public.player_session_balances;
create policy player_session_balances_select
  on public.player_session_balances
  for select
  to authenticated
  using (
    public.has_role('admin')
    or public.is_approved_guardian_for_player(player_id)
    or public.coach_can_read_player(player_id)
  );

drop policy if exists payment_claims_select on public.payment_claims;
create policy payment_claims_select
  on public.payment_claims
  for select
  to authenticated
  using (
    public.has_role('admin')
    or guardian_user_id = auth.uid()
  );

drop policy if exists payment_claims_insert_own_pending on public.payment_claims;
create policy payment_claims_insert_own_pending
  on public.payment_claims
  for insert
  to authenticated
  with check (
    guardian_user_id = auth.uid()
    and status = 'pending'
    and public.is_approved_guardian_for_player(player_id)
  );

drop policy if exists payment_claims_admin_update on public.payment_claims;
create policy payment_claims_admin_update
  on public.payment_claims
  for update
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists session_credit_ledger_admin_select on public.session_credit_ledger;
create policy session_credit_ledger_admin_select
  on public.session_credit_ledger
  for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists session_attendance_select on public.session_attendance;
create policy session_attendance_select
  on public.session_attendance
  for select
  to authenticated
  using (
    public.has_role('admin')
    or public.is_approved_guardian_for_player(player_id)
    or public.coach_can_read_session(session_id)
  );

drop policy if exists session_leave_requests_select on public.session_leave_requests;
create policy session_leave_requests_select
  on public.session_leave_requests
  for select
  to authenticated
  using (
    public.has_role('admin')
    or exists (
      select 1
      from public.session_registrations r
      where r.id = registration_id
        and (
          public.is_approved_guardian_for_player(r.player_id)
          or public.coach_can_read_session(r.session_id)
        )
    )
  );

drop policy if exists session_leave_requests_insert_own on public.session_leave_requests;
create policy session_leave_requests_insert_own
  on public.session_leave_requests
  for insert
  to authenticated
  with check (
    status = 'pending'
    and exists (
      select 1
      from public.session_registrations r
      where r.id = registration_id
        and r.status = 'registered'
        and public.is_approved_guardian_for_player(r.player_id)
    )
  );

drop policy if exists session_leave_requests_admin_update on public.session_leave_requests;
create policy session_leave_requests_admin_update
  on public.session_leave_requests
  for update
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists club_runtime_settings_select on public.club_runtime_settings;
create policy club_runtime_settings_select
  on public.club_runtime_settings
  for select
  to authenticated
  using (key = 'bank_transfer_hint');

drop policy if exists club_runtime_settings_admin_write on public.club_runtime_settings;
create policy club_runtime_settings_admin_write
  on public.club_runtime_settings
  for all
  to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- ---------------------------------------------------------------------------
-- Grants (RLS still applies). Functions are security definer.
-- ---------------------------------------------------------------------------

grant usage on type public.package_age_band to authenticated;
grant usage on type public.payment_claim_status to authenticated;
grant usage on type public.attendance_status to authenticated;
grant usage on type public.credit_ledger_entry_type to authenticated;
grant usage on type public.leave_request_status to authenticated;

grant select, insert, update on table public.session_packages to authenticated;
grant select on table public.player_session_balances to authenticated;
grant select, insert, update on table public.payment_claims to authenticated;
grant select on table public.session_credit_ledger to authenticated;
grant select on table public.session_attendance to authenticated;
grant select, insert, update on table public.session_leave_requests to authenticated;
grant select, insert, update on table public.club_runtime_settings to authenticated;

revoke all on function public.submit_payment_claim(uuid, uuid, text) from public, anon;
revoke all on function public.admin_review_payment_claim(uuid, public.payment_claim_status, text) from public, anon;
revoke all on function public.admin_adjust_session_credits(uuid, integer, text) from public, anon;
revoke all on function public.admin_upsert_session_package(uuid, public.package_age_band, integer, integer, boolean) from public, anon;
revoke all on function public.admin_set_session_debit_override(uuid, boolean, integer) from public, anon;
revoke all on function public.admin_set_club_setting(text, text) from public, anon;
revoke all on function public.request_excused_leave(uuid, text) from public, anon;
revoke all on function public.staff_review_leave_request(uuid, public.leave_request_status, text) from public, anon;
revoke all on function public.mark_session_attendance(uuid, uuid, public.attendance_status) from public, anon;
revoke all on function public.compute_session_debit_plan(public.session_kind, public.age_band, public.attendance_status, boolean, integer, boolean, boolean) from public, anon;

grant execute on function public.submit_payment_claim(uuid, uuid, text) to authenticated;
grant execute on function public.admin_review_payment_claim(uuid, public.payment_claim_status, text) to authenticated;
grant execute on function public.admin_adjust_session_credits(uuid, integer, text) to authenticated;
grant execute on function public.admin_upsert_session_package(uuid, public.package_age_band, integer, integer, boolean) to authenticated;
grant execute on function public.admin_set_session_debit_override(uuid, boolean, integer) to authenticated;
grant execute on function public.admin_set_club_setting(text, text) to authenticated;
grant execute on function public.request_excused_leave(uuid, text) to authenticated;
grant execute on function public.staff_review_leave_request(uuid, public.leave_request_status, text) to authenticated;
grant execute on function public.mark_session_attendance(uuid, uuid, public.attendance_status) to authenticated;
grant execute on function public.compute_session_debit_plan(public.session_kind, public.age_band, public.attendance_status, boolean, integer, boolean, boolean) to authenticated;
grant execute on function public.catalog_band_from_team_age_band(public.age_band) to authenticated;
grant execute on function public.credits_apply_to_age_band(public.age_band) to authenticated;
