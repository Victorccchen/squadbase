-- Phase 1 PR-01 verification: payment claim price snapshot.
-- Self-contained fixtures; runs in one transaction and rolls back.
-- Staging SQL Editor or local `supabase db reset`. Do not run on production.

begin;

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_parent uuid := gen_random_uuid();
  v_team uuid;
  v_player uuid;
  v_pkg uuid;
  v_pkg_new uuid;
  v_claim uuid;
  v_claim_new uuid;
  v_birth date;
  v_row public.payment_claims%rowtype;
  v_ledger public.session_credit_ledger%rowtype;
  v_bal public.player_session_balances%rowtype;
  v_failed boolean;
begin
  -- Fixtures (as the SQL owner; RLS does not apply).
  insert into auth.users (id, phone) values (v_admin, '+886900000001'), (v_parent, '+886900000002');
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.ensure_own_profile();
  perform set_config('request.jwt.claim.sub', v_parent::text, true);
  perform public.ensure_own_profile();
  insert into public.user_roles (user_id, role) values (v_admin, 'admin') on conflict do nothing;

  -- A birth date that falls in the U8 squad today.
  select d into v_birth
  from generate_series(public.club_today() - interval '9 years', public.club_today() - interval '5 years', interval '1 month') as g(d)
  where public.age_squad_band_from_birth_date(d::date, public.club_today()) = 'U8'
  limit 1;
  if v_birth is null then
    raise exception 'fixture: no U8 birth date found';
  end if;

  -- Age squads are one per band (teams_one_age_squad_per_band); reuse it if present.
  select id into v_team from public.teams where kind = 'age_squad' and age_band = 'U8';
  if v_team is null then
    insert into public.teams (name, age_band, kind) values ('PR01 U8 squad', 'U8', 'age_squad') returning id into v_team;
  end if;
  update public.teams set status = 'active' where id = v_team;
  insert into public.players (birth_date, name_en_given, name_en_family, name_zh)
  values (v_birth, 'Test', 'Player', '測試') returning id into v_player;
  insert into public.team_memberships (player_id, team_id, jersey_number) values (v_player, v_team, 77);
  insert into public.guardian_player_links (guardian_user_id, player_id, status, reviewed_by, reviewed_at)
  values (v_parent, v_player, 'approved', v_admin, now());

  -- Start from no active U8 7-credit package so the test owns the catalog row.
  update public.session_packages set active = false where age_band = 'U8' and credits = 7;
  insert into public.session_packages (age_band, credits, price_twd, active)
  values ('U8', 7, 2100, true) returning id into v_pkg;

  -- P01-a Submit stores the snapshot.
  perform set_config('request.jwt.claim.sub', v_parent::text, true);
  v_claim := public.submit_payment_claim(v_player, v_pkg, '12345');
  select * into v_row from public.payment_claims where id = v_claim;
  if v_row.price_twd_snapshot is distinct from 2100 or v_row.credits_snapshot is distinct from 7 then
    raise exception 'P01-a failed: snapshot not stored (% / %)', v_row.price_twd_snapshot, v_row.credits_snapshot;
  end if;

  -- P01-1 Changing the price of a claimed package is rejected (RPC path).
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  v_failed := false;
  begin
    perform public.admin_upsert_session_package(v_pkg, 'U8', 7, 2800, true);
  exception when others then
    v_failed := sqlerrm like '%package has claims%';
  end;
  if not v_failed then
    raise exception 'P01-1 failed: price change on a claimed package was allowed (RPC)';
  end if;

  -- P01-1 Same rule on a direct table write (trigger, not just the RPC).
  v_failed := false;
  begin
    update public.session_packages set price_twd = 2800 where id = v_pkg;
  exception when others then
    v_failed := sqlerrm like '%package has claims%';
  end;
  if not v_failed then
    raise exception 'P01-1 failed: price change on a claimed package was allowed (table)';
  end if;

  -- Deactivating is still allowed.
  perform public.admin_upsert_session_package(v_pkg, 'U8', 7, 2100, false);

  -- P01-2 A new active package with the same band and credits can be added.
  v_pkg_new := public.admin_upsert_session_package(null, 'U8', 7, 2800, true);

  -- Reactivating the old one while the new one is active is rejected.
  v_failed := false;
  begin
    perform public.admin_upsert_session_package(v_pkg, 'U8', 7, 2100, true);
  exception when others then
    v_failed := sqlerrm like '%active package already exists%';
  end;
  if not v_failed then
    raise exception 'P01-2 failed: two active packages with the same band and credits';
  end if;

  -- P01-2 Approving the old claim credits the old terms.
  perform public.admin_review_payment_claim(v_claim, 'approved', null);
  select * into v_ledger from public.session_credit_ledger where claim_id = v_claim;
  if v_ledger.amount is distinct from 7 or v_ledger.amount_twd is distinct from 2100 then
    raise exception 'P01-2 failed: ledger % credits / % TWD', v_ledger.amount, v_ledger.amount_twd;
  end if;
  if v_ledger.unit_cost_twd is distinct from 300 then
    raise exception 'P01-2 failed: unit cost % (expected 300)', v_ledger.unit_cost_twd;
  end if;

  -- A claim on the new package uses the new price.
  perform set_config('request.jwt.claim.sub', v_parent::text, true);
  v_claim_new := public.submit_payment_claim(v_player, v_pkg_new, '54321');
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.admin_review_payment_claim(v_claim_new, 'approved', null);

  select * into v_bal from public.player_session_balances where player_id = v_player;
  if v_bal.credits_available is distinct from 14 then
    raise exception 'P01-2 failed: balance % (expected 14)', v_bal.credits_available;
  end if;
  -- (7 × 300 + 7 × 400) / 14 = 350
  if v_bal.avg_unit_cost_twd is distinct from 350 then
    raise exception 'P01-2 failed: average unit cost % (expected 350)', v_bal.avg_unit_cost_twd;
  end if;

  -- P01-3 Approved remittance from snapshots does not move.
  if (
    select sum(price_twd_snapshot) from public.payment_claims
    where player_id = v_player and status = 'approved'
  ) is distinct from 4900 then
    raise exception 'P01-3 failed: approved remittance changed';
  end if;

  raise notice 'payment_claim_price_snapshot_verification: all checks passed';
end;
$$;

rollback;
