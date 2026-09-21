-- Stage 5C verification (staging SQL Editor).
-- Asserts score payload validators, Stage 5 → phase/ABCD mapping, and RPC signatures.
-- Rolls back so it does not leave rows. Do not run on production.

begin;

do $$
declare
  v_ok boolean;
  v_note text;
  v_scores jsonb;
begin
  v_ok := public.assessment_score_item_is_valid(
    '{"dimension_kind":"trait","dimension_code":"A","score":3}'::jsonb
  );
  if v_ok is not true then
    raise exception 'T5C validator: trait A score 3 should pass';
  end if;

  v_ok := public.assessment_score_item_is_valid(
    '{"dimension_kind":"phase","dimension_code":"defence","score":5}'::jsonb
  );
  if v_ok is not true then
    raise exception 'T5C validator: phase defence score 5 should pass';
  end if;

  -- T5C-2: score 0 / 6 rejected
  v_ok := public.assessment_score_item_is_valid(
    '{"dimension_kind":"trait","dimension_code":"B","score":0}'::jsonb
  );
  if v_ok is not false then
    raise exception 'T5C-2: score 0 should be rejected';
  end if;

  v_ok := public.assessment_score_item_is_valid(
    '{"dimension_kind":"phase","dimension_code":"attack","score":6}'::jsonb
  );
  if v_ok is not false then
    raise exception 'T5C-2: score 6 should be rejected';
  end if;

  -- Unknown codes rejected (attach is not a phase; maps to attack in product copy only)
  v_ok := public.assessment_score_item_is_valid(
    '{"dimension_kind":"phase","dimension_code":"attach","score":3}'::jsonb
  );
  if v_ok is not false then
    raise exception 'T5C validator: attach is not a stored phase code';
  end if;

  v_ok := public.assessment_scores_payload_is_valid(
    '[{"dimension_kind":"trait","dimension_code":"A","score":2}]'::jsonb
  );
  if v_ok is not true then
    raise exception 'T5C-1: a single score payload should pass';
  end if;

  v_ok := public.assessment_scores_payload_is_valid('[]'::jsonb);
  if v_ok is not false then
    raise exception 'T5C-1: empty score payload should fail';
  end if;

  v_ok := public.assessment_scores_payload_is_valid(
    '[{"dimension_kind":"trait","dimension_code":"A","score":2},{"dimension_kind":"trait","dimension_code":"A","score":3}]'::jsonb
  );
  if v_ok is not false then
    raise exception 'T5C validator: duplicate dimension should fail';
  end if;

  -- T5C-7: Stage 5 situation keys map to phase codes
  v_scores := '[]'::jsonb;
  v_scores := v_scores || jsonb_build_array(jsonb_build_object(
    'dimension_kind', 'phase', 'dimension_code', 'attack', 'score', 3
  ));
  v_scores := v_scores || jsonb_build_array(jsonb_build_object(
    'dimension_kind', 'phase', 'dimension_code', 'defence', 'score', 4
  ));
  v_scores := v_scores || jsonb_build_array(jsonb_build_object(
    'dimension_kind', 'phase', 'dimension_code', 'trans_defence', 'score', 2
  ));
  v_scores := v_scores || jsonb_build_array(jsonb_build_object(
    'dimension_kind', 'phase', 'dimension_code', 'trans_attack', 'score', 5
  ));
  v_ok := public.assessment_scores_payload_is_valid(v_scores);
  if v_ok is not true then
    raise exception 'T5C-7: mapped phase scores should be valid';
  end if;

  v_note := public.assessment_notes_from_stage5_jsonb(
    '{"attack":{"score":3,"note":"first touch"},"defense":{"score":4},"attack_to_defense":{"score":2},"defense_to_attack":{"score":5}}'::jsonb,
    '{"adaptability":{"score":1},"resilience":{"score":2},"coachability":{"score":3},"team_commitment":{"score":4}}'::jsonb
  );
  if v_note is distinct from 'attack: first touch' then
    raise exception 'T5C-7: Stage 5 notes should concatenate into the event note';
  end if;

  if to_regprocedure('public.create_assessment_event(uuid, timestamptz, text, uuid, jsonb)') is null then
    raise exception 'create_assessment_event signature missing';
  end if;
  if to_regprocedure('public.update_assessment_event(uuid, timestamptz, text, uuid, jsonb)') is null then
    raise exception 'update_assessment_event signature missing';
  end if;
  if to_regprocedure('public.delete_assessment_event(uuid)') is null then
    raise exception 'delete_assessment_event signature missing';
  end if;
  if to_regprocedure('public.create_player_assessment(uuid, date, jsonb, jsonb)') is null then
    raise exception 'create_player_assessment signature missing';
  end if;
end
$$;

rollback;
