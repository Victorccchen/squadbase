-- Phase 1 PR-09 verification: paper card move-in, history without debits,
-- opening balance at 300, photo purge, weekly parallel check.
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

-- A session at 17:00 Taipei on the given club date.
create function pg_temp.mk_session(p_team uuid, p_day date, p_title text)
returns uuid
language sql
as $$
  insert into public.training_sessions (team_id, starts_at, ends_at, title, kind)
  values (p_team, (p_day + time '17:00') at time zone 'Asia/Taipei',
          (p_day + time '18:30') at time zone 'Asia/Taipei', p_title, 'regular')
  returning id;
$$;

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_parent uuid := gen_random_uuid();
  v_today date := public.club_today();
  v_u8 uuid;
  v_u10 uuid;
  v_birth date;
  v_player uuid;
  v_s1 uuid;
  v_s2 uuid;
  v_s3 uuid;
  v_s5 uuid;
  v_card uuid;
  v_card2 uuid;
  v_path text;
  v_res jsonb;
  v_paths text[];
  v_count integer;
  v_failed boolean;
begin
  insert into auth.users (id) values (v_admin), (v_parent);
  perform pg_temp.as_user(v_admin);
  perform public.ensure_own_profile();
  perform pg_temp.as_user(v_parent);
  perform public.ensure_own_profile();
  insert into public.user_roles (user_id, role) values (v_admin, 'admin') on conflict do nothing;

  select d::date into v_birth
  from generate_series(v_today - interval '9 years', v_today - interval '5 years', interval '1 month') as g(d)
  where public.age_squad_band_from_birth_date(d::date, v_today) = 'U8'
  limit 1;
  select id into v_u8 from public.teams where kind = 'age_squad' and age_band = 'U8';
  select id into v_u10 from public.teams where kind = 'age_squad' and age_band = 'U10';
  update public.teams set status = 'active' where id in (v_u8, v_u10);
  insert into public.players (birth_date, name_en_given, name_en_family, name_zh)
  values (v_birth, 'Card', 'Verify', '舊卡') returning id into v_player;
  insert into public.guardian_player_links (guardian_user_id, player_id, status, reviewed_by, reviewed_at)
  values (v_parent, v_player, 'approved', v_admin, now());

  perform pg_temp.as_user(v_admin);
  perform public.admin_set_player_age_squad(v_player, v_u8, 71);
  perform public.admin_set_cross_squad(v_player, v_u10);

  v_s1 := pg_temp.mk_session(v_u8, v_today - 20, 'card s1');
  v_s2 := pg_temp.mk_session(v_u10, v_today - 13, 'card s2 cross');
  v_s3 := pg_temp.mk_session(v_u8, v_today - 6, 'card s3 already marked');
  v_s5 := pg_temp.mk_session(v_u8, v_today - 2, 'after move-in');

  -- The system already marked s3 before the card was moved in: a debit on an empty wallet.
  perform public.apply_session_attendance(v_s3, v_player, 'present', v_admin, 'staff');
  if pg_temp.balance(v_player) <> -1 then
    raise exception 'setup failed: expected an owed credit, balance %', pg_temp.balance(v_player);
  end if;

  -- C09-a Parents cannot create cards or read them.
  perform pg_temp.as_user(v_parent);
  v_failed := false;
  begin
    perform public.admin_create_paper_card(v_player);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'C09-a failed: parent created a card';
  end if;

  perform pg_temp.as_user(v_admin);
  v_card := public.admin_create_paper_card(v_player);

  perform pg_temp.as_user(v_parent);
  execute 'set local role authenticated';
  select count(*) into v_count from public.paper_cards where id = v_card;
  reset role;
  if v_count <> 0 then
    raise exception 'C09-a failed: parent can read paper cards';
  end if;

  -- C09-b Photos: only admins upload, only into a draft card's folder; attach checks the object.
  v_path := v_card::text || '/front-' || gen_random_uuid()::text || '.jpg';
  perform pg_temp.as_user(v_parent);
  execute 'set local role authenticated';
  v_failed := false;
  begin
    insert into storage.objects (bucket_id, name) values ('paper-cards', v_path);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  reset role;
  if not v_failed then
    raise exception 'C09-b failed: parent uploaded a card photo';
  end if;

  perform pg_temp.as_user(v_admin);
  execute 'set local role authenticated';
  insert into storage.objects (bucket_id, name) values ('paper-cards', v_path);
  reset role;
  v_failed := false;
  begin
    perform public.admin_attach_paper_card_photos(v_card, array[v_card::text || '/back-' || gen_random_uuid()::text || '.jpg']);
  exception when others then
    v_failed := sqlerrm like '%invalid photo path%';
  end;
  if not v_failed then
    raise exception 'C09-b failed: missing object attached';
  end if;
  perform public.admin_attach_paper_card_photos(v_card, array[v_path]);
  perform public.admin_save_paper_card_extraction(
    v_card, '{"cells": []}'::jsonb, false, 'A-123', 10, array['8.10']);

  -- C09-c Validation.
  v_failed := false;
  begin
    perform public.admin_confirm_paper_card(v_card, 'A-123', 10, array[v_today - 20], 11);
  exception when others then
    v_failed := sqlerrm like '%invalid remaining%';
  end;
  if not v_failed then
    raise exception 'C09-c failed: remaining above the package accepted';
  end if;
  v_failed := false;
  begin
    perform public.admin_confirm_paper_card(v_card, 'A-123', 10, array[v_today + 1], 7);
  exception when others then
    v_failed := sqlerrm like '%invalid used date%';
  end;
  if not v_failed then
    raise exception 'C09-c failed: future used date accepted';
  end if;

  -- P09-2 Confirm: balance = card remaining, opening_balance at 300, history without debits.
  v_res := public.admin_confirm_paper_card(
    v_card, 'A-123', 10,
    array[v_today - 20, v_today - 13, v_today - 6, v_today - 10, v_today - 20], 7);
  if (v_res ->> 'matched')::integer <> 3 or (v_res ->> 'unmatched')::integer <> 1
     or (v_res ->> 'reversed')::integer <> 1 then
    raise exception 'P09-2 failed: %', v_res;
  end if;
  if pg_temp.balance(v_player) <> 7 then
    raise exception 'P09-2 failed: balance % instead of 7', pg_temp.balance(v_player);
  end if;
  if not exists (
    select 1 from public.session_credit_ledger
    where player_id = v_player and entry_type = 'opening_balance' and amount = 7
      and unit_cost_twd = 300 and amount_twd = 2100 and reason like '%A-123%'
  ) then
    raise exception 'P09-2 failed: no opening_balance entry at 300';
  end if;
  if (select avg_unit_cost_twd from public.player_session_balances where player_id = v_player) <> 300 then
    raise exception 'P09-2 failed: average unit cost not 300';
  end if;
  select count(*) into v_count
  from public.session_attendance
  where player_id = v_player and paper_card_id = v_card and status = 'present' and credits_debited = 0;
  if v_count <> 3 then
    raise exception 'P09-2 failed: % covered attendances instead of 3', v_count;
  end if;
  if (select source from public.session_attendance where session_id = v_s2 and player_id = v_player) <> 'paper_card' then
    raise exception 'P09-2 failed: cross-squad date not matched as paper_card';
  end if;
  if (select sum(amount) from public.session_credit_ledger where player_id = v_player) <> 7 then
    raise exception 'P09-2 failed: ledger does not add up to the balance';
  end if;
  if not exists (select 1 from public.paper_card_unmatched_dates where card_id = v_card and used_date = v_today - 10) then
    raise exception 'P09-2 failed: unmatched date not kept';
  end if;
  if exists (
    select 1 from public.training_sessions s
    where public.club_session_date(s.starts_at) = v_today - 10 and s.title like 'card%'
  ) then
    raise exception 'P09-2 failed: a session was created for an unmatched date';
  end if;
  if (select status from public.paper_cards where id = v_card) <> 'confirmed' then
    raise exception 'P09-2 failed: card not confirmed';
  end if;

  -- P09-3 A new session after the move-in debits at 300; a covered one never debits again.
  perform public.apply_session_attendance(v_s5, v_player, 'present', v_admin, 'staff');
  if pg_temp.balance(v_player) <> 6 or not exists (
    select 1 from public.session_credit_ledger
    where player_id = v_player and session_id = v_s5 and amount = -1 and unit_cost_twd = 300
  ) then
    raise exception 'P09-3 failed: new debit not at 300 (balance %)', pg_temp.balance(v_player);
  end if;
  perform public.apply_session_attendance(v_s1, v_player, 'unexcused_absent', v_admin, 'staff');
  perform public.apply_session_attendance(v_s1, v_player, 'present', v_admin, 'staff');
  if pg_temp.balance(v_player) <> 6
     or (select credits_debited from public.session_attendance where session_id = v_s1 and player_id = v_player) <> 0 then
    raise exception 'P09-3 failed: covered attendance debited again';
  end if;

  -- C09-d A confirmed card cannot be confirmed twice, nor the same card number again.
  v_failed := false;
  begin
    perform public.admin_confirm_paper_card(v_card, 'A-123', 10, '{}', 7);
  exception when others then
    v_failed := sqlerrm like '%already confirmed%';
  end;
  if not v_failed then
    raise exception 'C09-d failed: card confirmed twice';
  end if;
  v_card2 := public.admin_create_paper_card(v_player);
  v_failed := false;
  begin
    perform public.admin_confirm_paper_card(v_card2, 'A-123', 10, '{}', 7);
  exception when others then
    v_failed := sqlerrm like '%already confirmed%';
  end;
  if not v_failed then
    raise exception 'C09-d failed: same card number confirmed twice';
  end if;
  v_paths := public.admin_discard_paper_card(v_card2);
  if exists (select 1 from public.paper_cards where id = v_card2) then
    raise exception 'C09-d failed: draft not discarded';
  end if;

  -- P09-4 Photos: no upload after confirm; purge only once the objects are gone.
  perform pg_temp.as_user(v_admin);
  execute 'set local role authenticated';
  v_failed := false;
  begin
    insert into storage.objects (bucket_id, name)
    values ('paper-cards', v_card::text || '/back-' || gen_random_uuid()::text || '.jpg');
  exception when insufficient_privilege then
    v_failed := true;
  end;
  reset role;
  if not v_failed then
    raise exception 'P09-4 failed: photo uploaded to a confirmed card';
  end if;
  v_failed := false;
  begin
    perform public.admin_purge_paper_card_photos(v_card);
  exception when others then
    v_failed := sqlerrm like '%photos still stored%';
  end;
  if not v_failed then
    raise exception 'P09-4 failed: purge accepted while the photo is stored';
  end if;
  -- Stands in for the Storage API delete the app makes.
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'paper-cards' and name = v_path;
  perform public.admin_purge_paper_card_photos(v_card);
  if (select coalesce(array_length(photo_paths, 1), 0) from public.paper_cards where id = v_card) <> 0
     or (select photos_purged_at from public.paper_cards where id = v_card) is null then
    raise exception 'P09-4 failed: photo paths not cleared';
  end if;

  -- P09-5 Parallel check: mismatch opens a staff task, a later match closes it.
  v_res := public.staff_record_paper_card_check(v_player, 5, 'card says 5');
  if (v_res ->> 'matches')::boolean or (v_res ->> 'system_remaining')::integer <> 6 then
    raise exception 'P09-5 failed: %', v_res;
  end if;
  if not exists (
    select 1 from public.tasks
    where dedupe_key = 'paper_check:' || v_player and status = 'open' and assignee_role = 'staff'
      and kind = 'paper_card.mismatch'
  ) then
    raise exception 'P09-5 failed: no mismatch task';
  end if;
  v_res := public.staff_record_paper_card_check(v_player, 6);
  if not (v_res ->> 'matches')::boolean
     or exists (select 1 from public.tasks where dedupe_key = 'paper_check:' || v_player and status = 'open') then
    raise exception 'P09-5 failed: match did not close the task';
  end if;
  if (select count(*) from public.paper_card_checks where player_id = v_player) <> 2 then
    raise exception 'P09-5 failed: checks not kept';
  end if;

  -- C09-e AI jobs: admin only.
  perform public.admin_record_ai_job('paper_card_extract', 'test-model', 'paper_card:' || v_card, '{}'::jsonb, 'invalid', 0.01);
  perform pg_temp.as_user(v_parent);
  v_failed := false;
  begin
    perform public.admin_record_ai_job('paper_card_extract', 'test-model', null, null, 'failed', null);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'C09-e failed: parent recorded an AI job';
  end if;
  v_failed := false;
  begin
    perform public.staff_record_paper_card_check(v_player, 6);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'C09-e failed: parent recorded a parallel check';
  end if;

  raise notice 'paper_card_verification: all checks passed';
end;
$$;

rollback;
