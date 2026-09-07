-- Stage 5: player ability assessments (match situations + player traits).
-- Apply to the staging project only. Do not run against production.
--
-- Paste this file's CONTENTS in the staging SQL Editor (not a path string).
--
-- Schema choice: one player_assessments row per recorded assessment.
-- Situations and traits are JSONB objects with locked English keys. Each
-- value is { "score": 1-5, "note": string|null }. CTFA fine-grained
-- behaviour items are UI hints only and are not stored.
-- Multiple rows per player are history (no unique constraint on player_id).
--
-- Writes go through security-definer RPCs. Table GRANT is SELECT only.
-- Ability fields are never granted to anon and must not appear on public pages.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- JSONB validators (IMMUTABLE so CHECK constraints can use them)
-- ---------------------------------------------------------------------------

create or replace function public.assessment_item_is_valid(item jsonb)
returns boolean
language sql
immutable
as $$
  select
    item is not null
    and jsonb_typeof(item) = 'object'
    and (
      select coalesce(array_agg(k order by k), '{}'::text[])
      from jsonb_object_keys(item) as k
    ) <@ array['note', 'score']::text[]
    and item ? 'score'
    and jsonb_typeof(item->'score') = 'number'
    and (item->>'score') ~ '^[1-5]$'
    and (
      not (item ? 'note')
      or item->'note' = 'null'::jsonb
      or (
        jsonb_typeof(item->'note') = 'string'
        and char_length(item->>'note') <= 1000
      )
    );
$$;

create or replace function public.assessment_situations_are_valid(payload jsonb)
returns boolean
language sql
immutable
as $$
  select
    payload is not null
    and jsonb_typeof(payload) = 'object'
    and (
      select coalesce(array_agg(k order by k), '{}'::text[])
      from jsonb_object_keys(payload) as k
    ) = array['attack', 'attack_to_defense', 'defense', 'defense_to_attack']::text[]
    and public.assessment_item_is_valid(payload->'attack')
    and public.assessment_item_is_valid(payload->'defense')
    and public.assessment_item_is_valid(payload->'attack_to_defense')
    and public.assessment_item_is_valid(payload->'defense_to_attack');
$$;

create or replace function public.assessment_traits_are_valid(payload jsonb)
returns boolean
language sql
immutable
as $$
  select
    payload is not null
    and jsonb_typeof(payload) = 'object'
    and (
      select coalesce(array_agg(k order by k), '{}'::text[])
      from jsonb_object_keys(payload) as k
    ) = array['adaptability', 'coachability', 'resilience', 'team_commitment']::text[]
    and public.assessment_item_is_valid(payload->'adaptability')
    and public.assessment_item_is_valid(payload->'resilience')
    and public.assessment_item_is_valid(payload->'coachability')
    and public.assessment_item_is_valid(payload->'team_commitment');
$$;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.player_assessments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete restrict,
  assessed_on date not null,
  assessor_user_id uuid not null references public.profiles (id) on delete restrict,
  situations jsonb not null,
  traits jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint player_assessments_situations_valid
    check (public.assessment_situations_are_valid(situations)),
  constraint player_assessments_traits_valid
    check (public.assessment_traits_are_valid(traits))
);

create index if not exists player_assessments_player_id_assessed_on_idx
  on public.player_assessments (player_id, assessed_on desc, created_at desc);

create index if not exists player_assessments_assessor_user_id_idx
  on public.player_assessments (assessor_user_id);

comment on function public.assessment_item_is_valid(jsonb) is
  'Locked score item: integer 1–5 plus optional note (max 1000). Used by CHECK.';
comment on function public.assessment_situations_are_valid(jsonb) is
  'Situations object must have attack, defense, attack_to_defense, defense_to_attack.';
comment on function public.assessment_traits_are_valid(jsonb) is
  'Traits object must have adaptability, resilience, coachability, team_commitment.';
comment on table public.player_assessments is
  'Coach/admin development assessments. History: many rows per player. Ability fields are never public. CTFA checklist items are not stored.';

drop trigger if exists player_assessments_set_updated_at on public.player_assessments;
create trigger player_assessments_set_updated_at
  before update on public.player_assessments
  for each row
  execute function public.set_updated_at();

drop trigger if exists player_assessments_set_actor_columns on public.player_assessments;
create trigger player_assessments_set_actor_columns
  before insert or update on public.player_assessments
  for each row
  execute function public.set_actor_columns();

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------

create or replace function public.coach_can_assess_player(p_player_id uuid)
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
      and m.status = 'active'
      and public.is_assigned_coach_for_team(m.team_id)
  );
$$;

create or replace function public.staff_can_write_player_assessment(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      public.has_role('admin')
      or public.coach_can_assess_player(p_player_id)
    );
$$;

create or replace function public.can_read_player_assessment(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      public.has_role('admin')
      or public.coach_can_read_player(p_player_id)
      or public.is_approved_guardian_for_player(p_player_id)
    );
$$;

-- ---------------------------------------------------------------------------
-- Write RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_player_assessment(
  p_player_id uuid,
  p_assessed_on date,
  p_situations jsonb,
  p_traits jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.staff_can_write_player_assessment(p_player_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'player not found' using errcode = 'P0002';
  end if;

  if p_assessed_on > ((timezone('Asia/Taipei', now()))::date) then
    raise exception 'assessed_on cannot be in the future' using errcode = '22023';
  end if;

  if not public.assessment_situations_are_valid(p_situations) then
    raise exception 'invalid situations' using errcode = '22023';
  end if;

  if not public.assessment_traits_are_valid(p_traits) then
    raise exception 'invalid traits' using errcode = '22023';
  end if;

  insert into public.player_assessments (
    player_id,
    assessed_on,
    assessor_user_id,
    situations,
    traits,
    created_by,
    updated_by
  )
  values (
    p_player_id,
    p_assessed_on,
    v_actor,
    p_situations,
    p_traits,
    v_actor,
    v_actor
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.update_player_assessment(
  p_id uuid,
  p_assessed_on date,
  p_situations jsonb,
  p_traits jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_player_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select player_id into v_player_id
  from public.player_assessments
  where id = p_id;

  if v_player_id is null then
    raise exception 'assessment not found' using errcode = 'P0002';
  end if;

  if not public.staff_can_write_player_assessment(v_player_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_assessed_on > ((timezone('Asia/Taipei', now()))::date) then
    raise exception 'assessed_on cannot be in the future' using errcode = '22023';
  end if;

  if not public.assessment_situations_are_valid(p_situations) then
    raise exception 'invalid situations' using errcode = '22023';
  end if;

  if not public.assessment_traits_are_valid(p_traits) then
    raise exception 'invalid traits' using errcode = '22023';
  end if;

  update public.player_assessments
  set
    assessed_on = p_assessed_on,
    situations = p_situations,
    traits = p_traits,
    updated_by = v_actor
  where id = p_id;

  return p_id;
end;
$$;

create or replace function public.delete_player_assessment(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_player_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select player_id into v_player_id
  from public.player_assessments
  where id = p_id;

  if v_player_id is null then
    raise exception 'assessment not found' using errcode = 'P0002';
  end if;

  if not public.staff_can_write_player_assessment(v_player_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from public.player_assessments
  where id = p_id;

  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

revoke all on function public.assessment_item_is_valid(jsonb) from public, anon, authenticated;
revoke all on function public.assessment_situations_are_valid(jsonb) from public, anon, authenticated;
revoke all on function public.assessment_traits_are_valid(jsonb) from public, anon, authenticated;
revoke all on function public.coach_can_assess_player(uuid) from public, anon;
revoke all on function public.staff_can_write_player_assessment(uuid) from public, anon;
revoke all on function public.can_read_player_assessment(uuid) from public, anon;
revoke all on function public.create_player_assessment(uuid, date, jsonb, jsonb) from public, anon;
revoke all on function public.update_player_assessment(uuid, date, jsonb, jsonb) from public, anon;
revoke all on function public.delete_player_assessment(uuid) from public, anon;

grant execute on function public.coach_can_assess_player(uuid) to authenticated;
grant execute on function public.staff_can_write_player_assessment(uuid) to authenticated;
grant execute on function public.can_read_player_assessment(uuid) to authenticated;
grant execute on function public.create_player_assessment(uuid, date, jsonb, jsonb) to authenticated;
grant execute on function public.update_player_assessment(uuid, date, jsonb, jsonb) to authenticated;
grant execute on function public.delete_player_assessment(uuid) to authenticated;

alter table public.player_assessments enable row level security;

revoke all on table public.player_assessments from public, anon;
grant select on table public.player_assessments to authenticated;

drop policy if exists player_assessments_select_admin on public.player_assessments;
create policy player_assessments_select_admin
  on public.player_assessments
  for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists player_assessments_select_assigned_coach on public.player_assessments;
create policy player_assessments_select_assigned_coach
  on public.player_assessments
  for select
  to authenticated
  using (public.coach_can_read_player(player_id));

drop policy if exists player_assessments_select_approved_guardian on public.player_assessments;
create policy player_assessments_select_approved_guardian
  on public.player_assessments
  for select
  to authenticated
  using (public.is_approved_guardian_for_player(player_id));
