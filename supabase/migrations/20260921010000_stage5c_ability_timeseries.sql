-- Stage 5C: ability time-series (assessment events + dimension scores).
-- Apply to the staging project only. Do not run against production.
--
-- Paste this file's CONTENTS in the staging SQL Editor (not a path string).
--
-- Extends Stage 5. Does not drop player_assessments. New canonical write path
-- is assessment_events + assessment_scores (partial 1–5 scores allowed).
-- Stage 5 create/update RPCs also sync a complete snapshot into events/scores
-- so history stays one timeline. Existing Stage 5 situation ratings backfill
-- into phase scores (attack, defence, trans_attack, trans_defence).
-- Traits map to ABCD: A adaptability, B resilience, C coachability, D commitment.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Score payload validators
-- ---------------------------------------------------------------------------

create or replace function public.assessment_score_item_is_valid(item jsonb)
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
    ) <@ array['dimension_code', 'dimension_kind', 'score']::text[]
    and item ? 'dimension_kind'
    and item ? 'dimension_code'
    and item ? 'score'
    and jsonb_typeof(item->'score') = 'number'
    and (item->>'score') ~ '^[1-5]$'
    and (
      (
        item->>'dimension_kind' = 'trait'
        and item->>'dimension_code' in ('A', 'B', 'C', 'D')
      )
      or (
        item->>'dimension_kind' = 'phase'
        and item->>'dimension_code' in ('attack', 'defence', 'trans_attack', 'trans_defence')
      )
    );
$$;

create or replace function public.assessment_scores_payload_is_valid(payload jsonb)
returns boolean
language sql
immutable
as $$
  select
    payload is not null
    and jsonb_typeof(payload) = 'array'
    and jsonb_array_length(payload) between 1 and 8
    and (
      select bool_and(public.assessment_score_item_is_valid(elem))
      from jsonb_array_elements(payload) as elem
    )
    and (
      select count(*)
      from jsonb_array_elements(payload) as elem
    ) = (
      select count(*)
      from (
        select distinct elem->>'dimension_kind', elem->>'dimension_code'
        from jsonb_array_elements(payload) as elem
      ) as uniq
    );
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.assessment_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete restrict,
  assessed_at timestamptz not null,
  assessor_user_id uuid not null references public.profiles (id) on delete restrict,
  note text,
  session_id uuid references public.training_sessions (id) on delete set null,
  source_assessment_id uuid unique references public.player_assessments (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint assessment_events_note_length check (
    note is null or char_length(note) <= 1000
  )
);

create index if not exists assessment_events_player_id_assessed_at_idx
  on public.assessment_events (player_id, assessed_at desc, created_at desc);

create index if not exists assessment_events_assessor_user_id_idx
  on public.assessment_events (assessor_user_id);

create index if not exists assessment_events_session_id_idx
  on public.assessment_events (session_id)
  where session_id is not null;

create table if not exists public.assessment_scores (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.assessment_events (id) on delete cascade,
  dimension_kind text not null,
  dimension_code text not null,
  score smallint not null,
  constraint assessment_scores_kind_check
    check (dimension_kind in ('trait', 'phase')),
  constraint assessment_scores_score_check
    check (score between 1 and 5),
  constraint assessment_scores_code_check
    check (
      (dimension_kind = 'trait' and dimension_code in ('A', 'B', 'C', 'D'))
      or (
        dimension_kind = 'phase'
        and dimension_code in ('attack', 'defence', 'trans_attack', 'trans_defence')
      )
    ),
  constraint assessment_scores_event_dimension_key
    unique (event_id, dimension_kind, dimension_code)
);

create index if not exists assessment_scores_event_id_idx
  on public.assessment_scores (event_id);

create index if not exists assessment_scores_dimension_idx
  on public.assessment_scores (dimension_kind, dimension_code);

comment on function public.assessment_score_item_is_valid(jsonb) is
  'One trait (A–D) or phase score: integer 1–5.';
comment on function public.assessment_scores_payload_is_valid(jsonb) is
  'JSON array of 1–8 unique trait/phase scores.';
comment on table public.assessment_events is
  'One private ability assessment event per player + time. Never public. Stage 5C time-series header.';
comment on table public.assessment_scores is
  'Trait (ABCD) and phase scores for an assessment event. Partial events allowed; at least one score.';

drop trigger if exists assessment_events_set_updated_at on public.assessment_events;
create trigger assessment_events_set_updated_at
  before update on public.assessment_events
  for each row
  execute function public.set_updated_at();

drop trigger if exists assessment_events_set_actor_columns on public.assessment_events;
create trigger assessment_events_set_actor_columns
  before insert or update on public.assessment_events
  for each row
  execute function public.set_actor_columns();

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create or replace function public.replace_assessment_event_scores(
  p_event_id uuid,
  p_scores jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_elem jsonb;
begin
  if not public.assessment_scores_payload_is_valid(p_scores) then
    raise exception 'invalid score' using errcode = '22023';
  end if;

  delete from public.assessment_scores where event_id = p_event_id;

  for v_elem in select value from jsonb_array_elements(p_scores)
  loop
    insert into public.assessment_scores (
      event_id,
      dimension_kind,
      dimension_code,
      score
    )
    values (
      p_event_id,
      v_elem->>'dimension_kind',
      v_elem->>'dimension_code',
      (v_elem->>'score')::smallint
    );
  end loop;
end;
$$;

create or replace function public.assessment_notes_from_stage5_jsonb(
  p_situations jsonb,
  p_traits jsonb
)
returns text
language sql
immutable
as $$
  select nullif(
    concat_ws(
      E'\n',
      case
        when nullif(btrim(p_situations->'attack'->>'note'), '') is not null
          then 'attack: ' || btrim(p_situations->'attack'->>'note')
      end,
      case
        when nullif(btrim(p_situations->'defense'->>'note'), '') is not null
          then 'defence: ' || btrim(p_situations->'defense'->>'note')
      end,
      case
        when nullif(btrim(p_situations->'attack_to_defense'->>'note'), '') is not null
          then 'trans_defence: ' || btrim(p_situations->'attack_to_defense'->>'note')
      end,
      case
        when nullif(btrim(p_situations->'defense_to_attack'->>'note'), '') is not null
          then 'trans_attack: ' || btrim(p_situations->'defense_to_attack'->>'note')
      end,
      case
        when nullif(btrim(p_traits->'adaptability'->>'note'), '') is not null
          then 'A: ' || btrim(p_traits->'adaptability'->>'note')
      end,
      case
        when nullif(btrim(p_traits->'resilience'->>'note'), '') is not null
          then 'B: ' || btrim(p_traits->'resilience'->>'note')
      end,
      case
        when nullif(btrim(p_traits->'coachability'->>'note'), '') is not null
          then 'C: ' || btrim(p_traits->'coachability'->>'note')
      end,
      case
        when nullif(btrim(p_traits->'team_commitment'->>'note'), '') is not null
          then 'D: ' || btrim(p_traits->'team_commitment'->>'note')
      end
    ),
    ''
  );
$$;

create or replace function public.sync_assessment_event_from_player_assessment(
  p_assessment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.player_assessments%rowtype;
  v_event_id uuid;
  v_scores jsonb := '[]'::jsonb;
  v_note text;
begin
  select * into v_row
  from public.player_assessments
  where id = p_assessment_id;

  if v_row.id is null then
    raise exception 'assessment not found' using errcode = 'P0002';
  end if;

  v_note := public.assessment_notes_from_stage5_jsonb(v_row.situations, v_row.traits);

  if (v_row.situations->'attack'->>'score') ~ '^[1-5]$' then
    v_scores := v_scores || jsonb_build_array(jsonb_build_object(
      'dimension_kind', 'phase',
      'dimension_code', 'attack',
      'score', (v_row.situations->'attack'->>'score')::int
    ));
  end if;
  if (v_row.situations->'defense'->>'score') ~ '^[1-5]$' then
    v_scores := v_scores || jsonb_build_array(jsonb_build_object(
      'dimension_kind', 'phase',
      'dimension_code', 'defence',
      'score', (v_row.situations->'defense'->>'score')::int
    ));
  end if;
  if (v_row.situations->'attack_to_defense'->>'score') ~ '^[1-5]$' then
    v_scores := v_scores || jsonb_build_array(jsonb_build_object(
      'dimension_kind', 'phase',
      'dimension_code', 'trans_defence',
      'score', (v_row.situations->'attack_to_defense'->>'score')::int
    ));
  end if;
  if (v_row.situations->'defense_to_attack'->>'score') ~ '^[1-5]$' then
    v_scores := v_scores || jsonb_build_array(jsonb_build_object(
      'dimension_kind', 'phase',
      'dimension_code', 'trans_attack',
      'score', (v_row.situations->'defense_to_attack'->>'score')::int
    ));
  end if;
  if (v_row.traits->'adaptability'->>'score') ~ '^[1-5]$' then
    v_scores := v_scores || jsonb_build_array(jsonb_build_object(
      'dimension_kind', 'trait',
      'dimension_code', 'A',
      'score', (v_row.traits->'adaptability'->>'score')::int
    ));
  end if;
  if (v_row.traits->'resilience'->>'score') ~ '^[1-5]$' then
    v_scores := v_scores || jsonb_build_array(jsonb_build_object(
      'dimension_kind', 'trait',
      'dimension_code', 'B',
      'score', (v_row.traits->'resilience'->>'score')::int
    ));
  end if;
  if (v_row.traits->'coachability'->>'score') ~ '^[1-5]$' then
    v_scores := v_scores || jsonb_build_array(jsonb_build_object(
      'dimension_kind', 'trait',
      'dimension_code', 'C',
      'score', (v_row.traits->'coachability'->>'score')::int
    ));
  end if;
  if (v_row.traits->'team_commitment'->>'score') ~ '^[1-5]$' then
    v_scores := v_scores || jsonb_build_array(jsonb_build_object(
      'dimension_kind', 'trait',
      'dimension_code', 'D',
      'score', (v_row.traits->'team_commitment'->>'score')::int
    ));
  end if;

  if jsonb_array_length(v_scores) = 0 then
    raise exception 'invalid score' using errcode = '22023';
  end if;

  select id into v_event_id
  from public.assessment_events
  where source_assessment_id = p_assessment_id;

  if v_event_id is null then
    insert into public.assessment_events (
      player_id,
      assessed_at,
      assessor_user_id,
      note,
      source_assessment_id,
      created_by,
      updated_by
    )
    values (
      v_row.player_id,
      timezone('Asia/Taipei', v_row.assessed_on::timestamp),
      v_row.assessor_user_id,
      v_note,
      p_assessment_id,
      v_row.created_by,
      v_row.updated_by
    )
    returning id into v_event_id;
  else
    update public.assessment_events
    set
      assessed_at = timezone('Asia/Taipei', v_row.assessed_on::timestamp),
      assessor_user_id = v_row.assessor_user_id,
      note = v_note,
      updated_by = v_row.updated_by
    where id = v_event_id;
  end if;

  perform public.replace_assessment_event_scores(v_event_id, v_scores);
  return v_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Write RPCs (Stage 5C)
-- ---------------------------------------------------------------------------

create or replace function public.create_assessment_event(
  p_player_id uuid,
  p_assessed_at timestamptz,
  p_note text,
  p_session_id uuid,
  p_scores jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_id uuid;
  v_note text;
begin
  v_actor := auth.uid();
  if v_actor is null or not public.staff_can_write_player_assessment(p_player_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'player not found' using errcode = 'P0002';
  end if;

  if (timezone('Asia/Taipei', p_assessed_at))::date
     > ((timezone('Asia/Taipei', now()))::date) then
    raise exception 'assessed_on cannot be in the future' using errcode = '22023';
  end if;

  if p_session_id is not null and not exists (
    select 1
    from public.training_sessions s
    where s.id = p_session_id
      and s.deleted_at is null
  ) then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'note too long' using errcode = '22023';
  end if;

  if not public.assessment_scores_payload_is_valid(p_scores) then
    raise exception 'invalid score' using errcode = '22023';
  end if;

  insert into public.assessment_events (
    player_id,
    assessed_at,
    assessor_user_id,
    note,
    session_id,
    created_by,
    updated_by
  )
  values (
    p_player_id,
    p_assessed_at,
    v_actor,
    v_note,
    p_session_id,
    v_actor,
    v_actor
  )
  returning id into v_id;

  perform public.replace_assessment_event_scores(v_id, p_scores);
  return v_id;
end;
$$;

create or replace function public.update_assessment_event(
  p_id uuid,
  p_assessed_at timestamptz,
  p_note text,
  p_session_id uuid,
  p_scores jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_player_id uuid;
  v_note text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select player_id into v_player_id
  from public.assessment_events
  where id = p_id;

  if v_player_id is null then
    raise exception 'assessment not found' using errcode = 'P0002';
  end if;

  if not public.staff_can_write_player_assessment(v_player_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if (timezone('Asia/Taipei', p_assessed_at))::date
     > ((timezone('Asia/Taipei', now()))::date) then
    raise exception 'assessed_on cannot be in the future' using errcode = '22023';
  end if;

  if p_session_id is not null and not exists (
    select 1
    from public.training_sessions s
    where s.id = p_session_id
      and s.deleted_at is null
  ) then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'note too long' using errcode = '22023';
  end if;

  if not public.assessment_scores_payload_is_valid(p_scores) then
    raise exception 'invalid score' using errcode = '22023';
  end if;

  update public.assessment_events
  set
    assessed_at = p_assessed_at,
    note = v_note,
    session_id = p_session_id,
    updated_by = v_actor
  where id = p_id;

  perform public.replace_assessment_event_scores(p_id, p_scores);
  return p_id;
end;
$$;

create or replace function public.delete_assessment_event(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_player_id uuid;
  v_source uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select player_id, source_assessment_id
    into v_player_id, v_source
  from public.assessment_events
  where id = p_id;

  if v_player_id is null then
    raise exception 'assessment not found' using errcode = 'P0002';
  end if;

  if not public.staff_can_write_player_assessment(v_player_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from public.assessment_events where id = p_id;

  if v_source is not null then
    delete from public.player_assessments where id = v_source;
  end if;

  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Extend Stage 5 RPCs so complete snapshots stay on the same timeline
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

  perform public.sync_assessment_event_from_player_assessment(v_id);
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

  perform public.sync_assessment_event_from_player_assessment(p_id);
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

  delete from public.assessment_events
  where source_assessment_id = p_id;

  delete from public.player_assessments
  where id = p_id;

  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill Stage 5 snapshots into events/phase+trait scores
-- ---------------------------------------------------------------------------

do $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.player_assessments order by assessed_on, created_at
  loop
    perform public.sync_assessment_event_from_player_assessment(v_id);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

revoke all on function public.assessment_score_item_is_valid(jsonb) from public, anon, authenticated;
revoke all on function public.assessment_scores_payload_is_valid(jsonb) from public, anon, authenticated;
revoke all on function public.replace_assessment_event_scores(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.assessment_notes_from_stage5_jsonb(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.sync_assessment_event_from_player_assessment(uuid) from public, anon, authenticated;
revoke all on function public.create_assessment_event(uuid, timestamptz, text, uuid, jsonb) from public, anon;
revoke all on function public.update_assessment_event(uuid, timestamptz, text, uuid, jsonb) from public, anon;
revoke all on function public.delete_assessment_event(uuid) from public, anon;

grant execute on function public.create_assessment_event(uuid, timestamptz, text, uuid, jsonb) to authenticated;
grant execute on function public.update_assessment_event(uuid, timestamptz, text, uuid, jsonb) to authenticated;
grant execute on function public.delete_assessment_event(uuid) to authenticated;

alter table public.assessment_events enable row level security;
alter table public.assessment_scores enable row level security;

revoke all on table public.assessment_events from public, anon;
revoke all on table public.assessment_scores from public, anon;
grant select on table public.assessment_events to authenticated;
grant select on table public.assessment_scores to authenticated;

drop policy if exists assessment_events_select_admin on public.assessment_events;
create policy assessment_events_select_admin
  on public.assessment_events
  for select
  to authenticated
  using (public.has_role('admin'));

drop policy if exists assessment_events_select_assigned_coach on public.assessment_events;
create policy assessment_events_select_assigned_coach
  on public.assessment_events
  for select
  to authenticated
  using (public.coach_can_read_player(player_id));

drop policy if exists assessment_events_select_approved_guardian on public.assessment_events;
create policy assessment_events_select_approved_guardian
  on public.assessment_events
  for select
  to authenticated
  using (public.is_approved_guardian_for_player(player_id));

drop policy if exists assessment_scores_select_admin on public.assessment_scores;
create policy assessment_scores_select_admin
  on public.assessment_scores
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.assessment_events e
      where e.id = event_id
        and public.has_role('admin')
    )
  );

drop policy if exists assessment_scores_select_assigned_coach on public.assessment_scores;
create policy assessment_scores_select_assigned_coach
  on public.assessment_scores
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.assessment_events e
      where e.id = event_id
        and public.coach_can_read_player(e.player_id)
    )
  );

drop policy if exists assessment_scores_select_approved_guardian on public.assessment_scores;
create policy assessment_scores_select_approved_guardian
  on public.assessment_scores
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.assessment_events e
      where e.id = event_id
        and public.is_approved_guardian_for_player(e.player_id)
    )
  );
