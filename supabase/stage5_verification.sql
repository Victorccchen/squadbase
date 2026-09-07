-- Stage 5 verification (staging SQL Editor).
-- Asserts JSONB validators and the write RPC signatures.
-- Rolls back so it does not leave rows. Do not run on production.

begin;

do $$
declare
  v_ok boolean;
begin
  -- Valid situations + traits
  v_ok := public.assessment_situations_are_valid(
    '{"attack":{"score":3,"note":null},"defense":{"score":4},"attack_to_defense":{"score":2,"note":"press"},"defense_to_attack":{"score":5}}'::jsonb
  );
  if v_ok is not true then
    raise exception 'T5 validator: valid situations should pass';
  end if;

  v_ok := public.assessment_traits_are_valid(
    '{"adaptability":{"score":1},"resilience":{"score":2},"coachability":{"score":3},"team_commitment":{"score":4,"note":"ok"}}'::jsonb
  );
  if v_ok is not true then
    raise exception 'T5 validator: valid traits should pass';
  end if;

  -- Score 0 / 6 rejected
  v_ok := public.assessment_item_is_valid('{"score":0}'::jsonb);
  if v_ok is not false then
    raise exception 'T5-2: score 0 should be rejected';
  end if;

  v_ok := public.assessment_item_is_valid('{"score":6}'::jsonb);
  if v_ok is not false then
    raise exception 'T5-2: score 6 should be rejected';
  end if;

  -- Missing situation key rejected
  v_ok := public.assessment_situations_are_valid(
    '{"attack":{"score":3},"defense":{"score":4},"attack_to_defense":{"score":2}}'::jsonb
  );
  if v_ok is not false then
    raise exception 'T5 validator: incomplete situations should fail';
  end if;

  if to_regprocedure('public.create_player_assessment(uuid, date, jsonb, jsonb)') is null then
    raise exception 'create_player_assessment signature missing';
  end if;
  if to_regprocedure('public.update_player_assessment(uuid, date, jsonb, jsonb)') is null then
    raise exception 'update_player_assessment signature missing';
  end if;
  if to_regprocedure('public.delete_player_assessment(uuid)') is null then
    raise exception 'delete_player_assessment signature missing';
  end if;
end
$$;

rollback;
