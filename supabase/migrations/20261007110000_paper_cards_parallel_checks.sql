-- Phase 1 PR-09: paper session cards moved into the system, and the weekly
-- parallel check during the parallel season (D7, D8-1, D10).
-- Staging only. Do not run against production.
--
-- * paper_cards: one row per physical card. Staff create a draft, upload the
--   front and back photos (private bucket paper-cards), the app fills
--   `extracted` (AI read-out or manual), then staff confirm.
-- * admin_confirm_paper_card:
--     - each used date is matched to a session of one of the player's active
--       teams (primary first, then cross squad, then other teams) on that
--       club date. A match gets a present attendance with credits_debited = 0
--       and paper_card_id set. If the system already debited that session,
--       the debit is reversed: the card already paid for it.
--     - dates with no session go to paper_card_unmatched_dates (no session is
--       created).
--     - the remaining credits enter the ledger as opening_balance at the card's
--       unit price (300, D8-1); the weighted average unit cost follows the
--       purchase rule (balance <= 0 → the card price).
--   Photos are removed by the app through the Storage API (direct deletes
--   from storage.objects are blocked on Supabase); admin_purge_paper_card_photos
--   then clears the paths once the objects are gone.
-- * apply_session_attendance: an attendance covered by a paper card never
--   debits again (status can still be corrected).
-- * paper_card_checks / staff_record_paper_card_check: card remaining vs the
--   system balance; a mismatch opens a staff task, a match closes it.
-- * ai_jobs: one row per AI call (model, status, cost); the photo itself is
--   never stored here.

-- 1. Tables ----------------------------------------------------------------------------------

create table if not exists public.paper_cards (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete restrict,
  card_no text,
  package_credits integer,
  unit_cost_twd numeric(12, 4) not null default 300,
  squad_marks text[] not null default '{}',
  used_dates date[] not null default '{}',
  remaining integer,
  status text not null default 'draft',
  photo_paths text[] not null default '{}',
  photos_purged_at timestamptz,
  extracted jsonb,
  needs_manual boolean not null default false,
  ledger_id uuid references public.session_credit_ledger (id) on delete restrict,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz,
  constraint paper_cards_status_check check (status in ('draft', 'confirmed', 'retired')),
  constraint paper_cards_card_no_length check (card_no is null or char_length(card_no) between 1 and 40),
  constraint paper_cards_package_credits check (package_credits is null or package_credits in (10, 20, 30)),
  constraint paper_cards_unit_cost check (unit_cost_twd > 0),
  constraint paper_cards_remaining_range check (remaining is null or remaining between 0 and 30),
  constraint paper_cards_used_dates_count check (coalesce(array_length(used_dates, 1), 0) <= 30),
  constraint paper_cards_photo_count check (coalesce(array_length(photo_paths, 1), 0) <= 4),
  constraint paper_cards_confirmed_complete check (
    status = 'draft'
    or (remaining is not null and package_credits is not null and confirmed_by is not null and confirmed_at is not null)
  )
);

create index if not exists paper_cards_player_idx on public.paper_cards (player_id, created_at desc);
create unique index if not exists paper_cards_player_card_no_idx
  on public.paper_cards (player_id, card_no)
  where status <> 'draft' and card_no is not null;

comment on table public.paper_cards is
  'PR-09: physical session cards moved into the system (D7, D8-1). Photos live in the private paper-cards bucket only until the card is confirmed.';

create table if not exists public.paper_card_unmatched_dates (
  card_id uuid not null references public.paper_cards (id) on delete cascade,
  used_date date not null,
  primary key (card_id, used_date)
);

comment on table public.paper_card_unmatched_dates is
  'PR-09: used dates on a paper card with no session of the player''s teams that day. Kept for review; no session is created.';

alter table public.session_attendance
  add column if not exists paper_card_id uuid references public.paper_cards (id) on delete restrict;

comment on column public.session_attendance.paper_card_id is
  'PR-09: set when a paper card covers this attendance. Such a row never debits credits.';

create table if not exists public.paper_card_checks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete restrict,
  check_date date not null,
  card_remaining integer not null,
  system_remaining integer not null,
  matches boolean generated always as (card_remaining = system_remaining) stored,
  note text,
  checked_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint paper_card_checks_card_range check (card_remaining between 0 and 30),
  constraint paper_card_checks_note_length check (note is null or char_length(note) <= 300)
);

create index if not exists paper_card_checks_player_idx on public.paper_card_checks (player_id, created_at desc);
create index if not exists paper_card_checks_date_idx on public.paper_card_checks (check_date);

comment on table public.paper_card_checks is
  'PR-09: weekly spot check during the parallel season (D7). A mismatch opens a staff task.';

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  model text not null,
  input_ref text,
  output jsonb,
  status text not null,
  cost_usd numeric(10, 4),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint ai_jobs_kind_check check (kind in ('paper_card_extract')),
  constraint ai_jobs_status_check check (status in ('succeeded', 'failed', 'refused', 'invalid')),
  constraint ai_jobs_model_length check (char_length(model) between 1 and 100),
  constraint ai_jobs_input_ref_length check (input_ref is null or char_length(input_ref) <= 200),
  constraint ai_jobs_cost_nonneg check (cost_usd is null or cost_usd >= 0)
);

create index if not exists ai_jobs_created_idx on public.ai_jobs (created_at desc);

comment on table public.ai_jobs is
  'PR-09: one row per AI call. input_ref names the record (e.g. paper_card:<id>); images are never stored here.';

drop trigger if exists paper_cards_set_updated_at on public.paper_cards;
create trigger paper_cards_set_updated_at
  before update on public.paper_cards
  for each row
  execute function public.set_updated_at();

alter table public.paper_cards enable row level security;
alter table public.paper_card_unmatched_dates enable row level security;
alter table public.paper_card_checks enable row level security;
alter table public.ai_jobs enable row level security;

revoke all on public.paper_cards from anon, authenticated;
revoke all on public.paper_card_unmatched_dates from anon, authenticated;
revoke all on public.paper_card_checks from anon, authenticated;
revoke all on public.ai_jobs from anon, authenticated;
grant select on public.paper_cards to authenticated;
grant select on public.paper_card_unmatched_dates to authenticated;
grant select on public.paper_card_checks to authenticated;
grant select on public.ai_jobs to authenticated;

drop policy if exists paper_cards_select_admin on public.paper_cards;
create policy paper_cards_select_admin
  on public.paper_cards for select to authenticated
  using (public.has_role('admin'));

drop policy if exists paper_card_unmatched_dates_select_admin on public.paper_card_unmatched_dates;
create policy paper_card_unmatched_dates_select_admin
  on public.paper_card_unmatched_dates for select to authenticated
  using (public.has_role('admin'));

drop policy if exists paper_card_checks_select_admin on public.paper_card_checks;
create policy paper_card_checks_select_admin
  on public.paper_card_checks for select to authenticated
  using (public.has_role('admin'));

drop policy if exists ai_jobs_select_admin on public.ai_jobs;
create policy ai_jobs_select_admin
  on public.ai_jobs for select to authenticated
  using (public.has_role('admin'));

-- 2. Photo bucket ---------------------------------------------------------------------------
-- Path: <card id>/<front|back>-<uuid>.<ext>. Upload only while the card is a draft.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('paper-cards', 'paper-cards', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists paper_cards_photo_select on storage.objects;
create policy paper_cards_photo_select
  on storage.objects for select to authenticated
  using (bucket_id = 'paper-cards' and public.has_role('admin'));

drop policy if exists paper_cards_photo_insert on storage.objects;
create policy paper_cards_photo_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'paper-cards'
    and public.has_role('admin')
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(front|back)-[0-9a-f-]+\.(jpg|jpeg|png|webp)$'
    and exists (
      select 1 from public.paper_cards c
      where c.id::text = split_part(name, '/', 1) and c.status = 'draft'
    )
  );

drop policy if exists paper_cards_photo_delete on storage.objects;
create policy paper_cards_photo_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'paper-cards' and public.has_role('admin'));

-- 3. Draft lifecycle --------------------------------------------------------------------------

create or replace function public.admin_create_paper_card(p_player_id uuid)
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
  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'player not found' using errcode = 'P0002';
  end if;
  insert into public.paper_cards (player_id, created_by)
  values (p_player_id, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_attach_paper_card_photos(p_card_id uuid, p_paths text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.paper_cards%rowtype;
  v_path text;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_card from public.paper_cards where id = p_card_id for update;
  if v_card.id is null then
    raise exception 'card not found' using errcode = 'P0002';
  end if;
  if v_card.status <> 'draft' then
    raise exception 'card already confirmed' using errcode = 'P0001';
  end if;
  foreach v_path in array coalesce(p_paths, '{}') loop
    if split_part(v_path, '/', 1) <> p_card_id::text
       or not exists (select 1 from storage.objects where bucket_id = 'paper-cards' and name = v_path) then
      raise exception 'invalid photo path' using errcode = '22023';
    end if;
  end loop;
  update public.paper_cards
  set photo_paths = (select coalesce(array_agg(distinct p), '{}') from unnest(v_card.photo_paths || coalesce(p_paths, '{}')) as p)
  where id = p_card_id;
end;
$$;

create or replace function public.admin_save_paper_card_extraction(
  p_card_id uuid,
  p_extracted jsonb,
  p_needs_manual boolean,
  p_card_no text default null,
  p_package_credits integer default null,
  p_squad_marks text[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.paper_cards%rowtype;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_card from public.paper_cards where id = p_card_id for update;
  if v_card.id is null then
    raise exception 'card not found' using errcode = 'P0002';
  end if;
  if v_card.status <> 'draft' then
    raise exception 'card already confirmed' using errcode = 'P0001';
  end if;
  update public.paper_cards
  set extracted = p_extracted,
      needs_manual = coalesce(p_needs_manual, false),
      card_no = nullif(left(btrim(coalesce(p_card_no, '')), 40), ''),
      package_credits = case when p_package_credits in (10, 20, 30) then p_package_credits end,
      squad_marks = coalesce(p_squad_marks, '{}')
  where id = p_card_id;
end;
$$;

-- Drafts only. Returns the photo paths so the app removes them from storage.
create or replace function public.admin_discard_paper_card(p_card_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.paper_cards%rowtype;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_card from public.paper_cards where id = p_card_id for update;
  if v_card.id is null then
    raise exception 'card not found' using errcode = 'P0002';
  end if;
  if v_card.status <> 'draft' then
    raise exception 'card already confirmed' using errcode = 'P0001';
  end if;
  delete from public.paper_cards where id = p_card_id;
  return v_card.photo_paths;
end;
$$;

-- 4. Confirm ------------------------------------------------------------------------------------

create or replace function public.admin_confirm_paper_card(
  p_card_id uuid,
  p_card_no text,
  p_package_credits integer,
  p_used_dates date[],
  p_remaining integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.paper_cards%rowtype;
  v_card_no text := nullif(left(btrim(coalesce(p_card_no, '')), 40), '');
  v_dates date[];
  v_date date;
  v_session_id uuid;
  v_att public.session_attendance%rowtype;
  v_bal public.player_session_balances%rowtype;
  v_unit numeric(12, 4);
  v_new_avg numeric(12, 4);
  v_ledger_id uuid;
  v_label text;
  v_matched integer := 0;
  v_unmatched integer := 0;
  v_reversed integer := 0;
  v_balance integer;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_card from public.paper_cards where id = p_card_id for update;
  if v_card.id is null then
    raise exception 'card not found' using errcode = 'P0002';
  end if;
  if v_card.status <> 'draft' then
    raise exception 'card already confirmed' using errcode = 'P0001';
  end if;
  if p_package_credits is null or p_package_credits not in (10, 20, 30) then
    raise exception 'invalid package credits' using errcode = '22023';
  end if;
  if p_remaining is null or p_remaining < 0 or p_remaining > p_package_credits then
    raise exception 'invalid remaining' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct d order by d), '{}') into v_dates
  from unnest(coalesce(p_used_dates, '{}')) as d
  where d is not null;
  if coalesce(array_length(v_dates, 1), 0) > 30 then
    raise exception 'too many used dates' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_dates) as d where d > public.club_today()) then
    raise exception 'invalid used date' using errcode = '22023';
  end if;
  if v_card_no is not null and exists (
    select 1 from public.paper_cards
    where player_id = v_card.player_id and card_no = v_card_no and status <> 'draft'
  ) then
    raise exception 'card already confirmed' using errcode = 'P0001';
  end if;

  v_label := 'paper card ' || coalesce(v_card_no, left(p_card_id::text, 8));

  perform public.ensure_player_session_balance(v_card.player_id);
  select * into v_bal from public.player_session_balances where player_id = v_card.player_id for update;

  -- Used dates → history.
  foreach v_date in array v_dates loop
    select s.id into v_session_id
    from public.training_sessions s
    join public.team_memberships m
      on m.team_id = s.team_id and m.player_id = v_card.player_id and m.status = 'active'
    where s.deleted_at is null
      and s.starts_at <= now()
      and public.club_session_date(s.starts_at) = v_date
    order by case m.squad_role when 'primary' then 0 when 'cross' then 1 else 2 end, s.starts_at
    limit 1;

    if v_session_id is null then
      insert into public.paper_card_unmatched_dates (card_id, used_date)
      values (p_card_id, v_date)
      on conflict do nothing;
      v_unmatched := v_unmatched + 1;
      continue;
    end if;

    v_matched := v_matched + 1;
    select * into v_att
    from public.session_attendance
    where session_id = v_session_id and player_id = v_card.player_id
    for update;

    if v_att.id is null then
      insert into public.session_attendance (
        session_id, player_id, status, credits_debited, marked_by, marked_at, created_by, updated_by,
        source, paper_card_id
      )
      values (
        v_session_id, v_card.player_id, 'present', 0, auth.uid(), now(), auth.uid(), auth.uid(),
        'paper_card', p_card_id
      );
    elsif v_att.paper_card_id is null then
      -- The card already paid for this session: give back what the system debited.
      if v_att.credits_debited > 0 then
        select l.unit_cost_twd into v_unit
        from public.session_credit_ledger l
        where l.attendance_id = v_att.id and l.amount < 0
        order by l.created_at desc
        limit 1;
        v_unit := coalesce(v_unit, v_bal.avg_unit_cost_twd);
        update public.player_session_balances
        set credits_available = credits_available + v_att.credits_debited,
            updated_by = auth.uid()
        where player_id = v_card.player_id;
        insert into public.session_credit_ledger (
          player_id, entry_type, amount, unit_cost_twd, amount_twd,
          session_id, attendance_id, actor_user_id, reason
        )
        values (
          v_card.player_id, 'reversal', v_att.credits_debited, v_unit,
          v_att.credits_debited::numeric * v_unit,
          v_session_id, v_att.id, auth.uid(), left('covered by ' || v_label, 500)
        );
        v_reversed := v_reversed + v_att.credits_debited;
      end if;
      update public.session_attendance
      set status = 'present',
          credits_debited = 0,
          paper_card_id = p_card_id,
          marked_by = auth.uid(),
          marked_at = now(),
          updated_by = auth.uid()
      where id = v_att.id;
    end if;
  end loop;

  -- Remaining credits → opening balance at the card price (D8-1).
  select * into v_bal from public.player_session_balances where player_id = v_card.player_id;
  if p_remaining > 0 then
    v_unit := v_card.unit_cost_twd;
    if v_bal.credits_available <= 0 then
      v_new_avg := v_unit;
    else
      v_new_avg := ((v_bal.credits_available::numeric * v_bal.avg_unit_cost_twd) + (p_remaining::numeric * v_unit))
                   / (v_bal.credits_available + p_remaining)::numeric;
    end if;
    update public.player_session_balances
    set credits_available = credits_available + p_remaining,
        avg_unit_cost_twd = v_new_avg,
        updated_by = auth.uid()
    where player_id = v_card.player_id;
    insert into public.session_credit_ledger (
      player_id, entry_type, amount, unit_cost_twd, amount_twd, actor_user_id, reason
    )
    values (
      v_card.player_id, 'opening_balance', p_remaining, v_unit, p_remaining::numeric * v_unit,
      auth.uid(), v_label
    )
    returning id into v_ledger_id;
  end if;

  update public.paper_cards
  set status = 'confirmed',
      card_no = v_card_no,
      package_credits = p_package_credits,
      used_dates = v_dates,
      remaining = p_remaining,
      ledger_id = v_ledger_id,
      confirmed_by = auth.uid(),
      confirmed_at = now()
  where id = p_card_id;

  select credits_available into v_balance from public.player_session_balances where player_id = v_card.player_id;

  perform public.write_audit('paper_card.confirmed', 'paper_card', p_card_id, null,
    jsonb_build_object('player_id', v_card.player_id, 'card_no', v_card_no, 'package_credits', p_package_credits,
                       'remaining', p_remaining, 'used', coalesce(array_length(v_dates, 1), 0),
                       'matched', v_matched, 'unmatched', v_unmatched, 'reversed', v_reversed));

  return jsonb_build_object(
    'matched', v_matched, 'unmatched', v_unmatched, 'reversed', v_reversed,
    'credits_available', v_balance, 'photo_paths', to_jsonb(v_card.photo_paths)
  );
end;
$$;

-- After the app removed the photos through the Storage API.
create or replace function public.admin_purge_paper_card_photos(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.paper_cards%rowtype;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_card from public.paper_cards where id = p_card_id for update;
  if v_card.id is null then
    raise exception 'card not found' using errcode = 'P0002';
  end if;
  if v_card.status = 'draft' then
    raise exception 'card not confirmed' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from storage.objects
    where bucket_id = 'paper-cards' and name = any (v_card.photo_paths)
  ) then
    raise exception 'photos still stored' using errcode = 'P0001';
  end if;
  update public.paper_cards
  set photo_paths = '{}', photos_purged_at = coalesce(photos_purged_at, now())
  where id = p_card_id;
end;
$$;

-- 5. A paper-card attendance never debits again -------------------------------------------------
-- Same as 20261004100000 except the early return for rows with paper_card_id.

create or replace function public.apply_session_attendance(
  p_session_id uuid,
  p_player_id uuid,
  p_status public.attendance_status,
  p_actor uuid,
  p_source text default null
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
  v_reverse_unit numeric(12, 4);
  v_id uuid;
begin
  select * into v_session
  from public.training_sessions
  where id = p_session_id
  for update;
  if not found or v_session.deleted_at is not null then
    raise exception 'session not found';
  end if;

  select * into v_team from public.teams where id = v_session.team_id;

  v_leave_approved := exists (
    select 1
    from public.session_registrations r
    join public.session_leave_requests l on l.registration_id = r.id
    where r.session_id = p_session_id
      and r.player_id = p_player_id
      and r.status in ('registered', 'late_cancelled')
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

  if v_existing.paper_card_id is not null then
    update public.session_attendance
    set
      status = v_status,
      marked_by = p_actor,
      marked_at = now(),
      updated_by = p_actor
    where id = v_existing.id;
    return v_existing.id;
  end if;

  perform public.ensure_player_session_balance(p_player_id);
  select * into v_bal
  from public.player_session_balances
  where player_id = p_player_id
  for update;

  if v_existing.id is not null and v_existing.credits_debited > 0 then
    select l.unit_cost_twd into v_reverse_unit
    from public.session_credit_ledger l
    where l.attendance_id = v_existing.id
      and l.amount < 0
    order by l.created_at desc
    limit 1;
    v_reverse_unit := coalesce(v_reverse_unit, v_bal.avg_unit_cost_twd);

    update public.player_session_balances
    set
      credits_available = credits_available + v_existing.credits_debited,
      updated_by = p_actor
    where player_id = p_player_id;

    insert into public.session_credit_ledger (
      player_id, entry_type, amount, unit_cost_twd, amount_twd,
      session_id, attendance_id, actor_user_id, reason
    )
    values (
      p_player_id, 'reversal', v_existing.credits_debited, v_reverse_unit,
      v_existing.credits_debited::numeric * v_reverse_unit,
      p_session_id, v_existing.id, p_actor, 'attendance change reversal'
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

  if v_existing.id is null then
    insert into public.session_attendance (
      session_id, player_id, status, credits_debited, marked_by, marked_at, created_by, updated_by,
      source, checked_in_at
    )
    values (
      p_session_id, p_player_id, v_status, v_plan.credits, p_actor, now(), p_actor, p_actor,
      coalesce(p_source, 'staff'),
      case when p_source = 'parent_qr' then now() end
    )
    returning id into v_id;
  else
    update public.session_attendance
    set
      status = v_status,
      credits_debited = v_plan.credits,
      marked_by = p_actor,
      marked_at = now(),
      updated_by = p_actor,
      source = coalesce(p_source, source),
      checked_in_at = case when p_source = 'parent_qr' then now() else checked_in_at end
    where id = v_existing.id
    returning id into v_id;
  end if;

  if v_plan.credits > 0 then
    update public.player_session_balances
    set
      credits_available = credits_available - v_plan.credits,
      updated_by = p_actor
    where player_id = p_player_id;

    -- Owed credits (balance below zero) carry the current average, 0 if the
    -- player never bought; reports flag them as 欠堂.
    insert into public.session_credit_ledger (
      player_id, entry_type, amount, unit_cost_twd, amount_twd,
      session_id, attendance_id, actor_user_id, reason
    )
    values (
      p_player_id, v_plan.entry_type, -v_plan.credits, v_bal.avg_unit_cost_twd,
      v_plan.credits::numeric * v_bal.avg_unit_cost_twd,
      p_session_id, v_id, p_actor, 'attendance debit'
    );
  end if;

  return v_id;
end;
$$;

-- 6. Weekly parallel check (D7) -------------------------------------------------------------------

create or replace function public.staff_record_paper_card_check(
  p_player_id uuid,
  p_card_remaining integer,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_system integer;
  v_id uuid;
  v_today date := public.club_today();
  v_key text := 'paper_check:' || p_player_id;
begin
  if auth.uid() is null or not public.has_role('admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'player not found' using errcode = 'P0002';
  end if;
  if p_card_remaining is null or p_card_remaining < 0 or p_card_remaining > 30 then
    raise exception 'invalid remaining' using errcode = '22023';
  end if;

  select coalesce((select credits_available from public.player_session_balances where player_id = p_player_id), 0)
    into v_system;

  insert into public.paper_card_checks (player_id, check_date, card_remaining, system_remaining, note, checked_by)
  values (p_player_id, v_today, p_card_remaining, v_system,
          nullif(left(btrim(coalesce(p_note, '')), 300), ''), auth.uid())
  returning id into v_id;

  if p_card_remaining = v_system then
    perform public.close_task_by_key(v_key, 'done');
  else
    -- A new mismatch replaces an older open one, so the task shows the latest numbers.
    perform public.close_task_by_key(v_key, 'dismissed');
    perform public.open_task(
      'paper_card.mismatch', 'player', p_player_id, v_key, 'staff', null,
      jsonb_build_object('check_id', v_id, 'check_date', v_today,
                         'card_remaining', p_card_remaining, 'system_remaining', v_system)
    );
  end if;

  perform public.write_audit('paper_card.checked', 'player', p_player_id, null,
    jsonb_build_object('card_remaining', p_card_remaining, 'system_remaining', v_system));

  return jsonb_build_object('id', v_id, 'card_remaining', p_card_remaining,
                            'system_remaining', v_system, 'matches', p_card_remaining = v_system);
end;
$$;

-- 7. AI job log ----------------------------------------------------------------------------------

create or replace function public.admin_record_ai_job(
  p_kind text,
  p_model text,
  p_input_ref text,
  p_output jsonb,
  p_status text,
  p_cost_usd numeric default null
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
  insert into public.ai_jobs (kind, model, input_ref, output, status, cost_usd, created_by)
  values (p_kind, p_model, left(p_input_ref, 200), p_output, p_status, p_cost_usd, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- 8. Grants -----------------------------------------------------------------------------------

revoke all on function public.admin_create_paper_card(uuid) from public, anon;
revoke all on function public.admin_attach_paper_card_photos(uuid, text[]) from public, anon;
revoke all on function public.admin_save_paper_card_extraction(uuid, jsonb, boolean, text, integer, text[]) from public, anon;
revoke all on function public.admin_discard_paper_card(uuid) from public, anon;
revoke all on function public.admin_confirm_paper_card(uuid, text, integer, date[], integer) from public, anon;
revoke all on function public.admin_purge_paper_card_photos(uuid) from public, anon;
revoke all on function public.staff_record_paper_card_check(uuid, integer, text) from public, anon;
revoke all on function public.admin_record_ai_job(text, text, text, jsonb, text, numeric) from public, anon;
revoke all on function public.apply_session_attendance(uuid, uuid, public.attendance_status, uuid, text) from public, anon, authenticated;

grant execute on function public.admin_create_paper_card(uuid) to authenticated;
grant execute on function public.admin_attach_paper_card_photos(uuid, text[]) to authenticated;
grant execute on function public.admin_save_paper_card_extraction(uuid, jsonb, boolean, text, integer, text[]) to authenticated;
grant execute on function public.admin_discard_paper_card(uuid) to authenticated;
grant execute on function public.admin_confirm_paper_card(uuid, text, integer, date[], integer) to authenticated;
grant execute on function public.admin_purge_paper_card_photos(uuid) to authenticated;
grant execute on function public.staff_record_paper_card_check(uuid, integer, text) to authenticated;
grant execute on function public.admin_record_ai_job(text, text, text, jsonb, text, numeric) to authenticated;
