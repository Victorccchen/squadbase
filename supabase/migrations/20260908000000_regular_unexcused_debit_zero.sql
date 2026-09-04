-- Stage 4B follow-up (staging only). Do not run against production.
-- Product lock Victor 2026-09-05: regular unexcused (無故缺席) debits 0.
-- Only special unexcused still deducts (−2). Regular present stays −1.
-- Does not rewrite 20260906000000_stage4b_session_credits.sql; CREATE OR REPLACE
-- of compute_session_debit_plan (same signature, so existing GRANTs are kept).
-- mark_session_attendance already calls this planner, so apply logic follows.
-- Idempotent. Safe to re-run.

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
    if p_attendance_status = 'present' then
      credits := 1;
      entry_type := v_entry;
      no_debit_label := false;
    else
      -- unexcused_absent (無故缺席): 0. Special unexcused still deducts below.
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

comment on function public.compute_session_debit_plan(
  public.session_kind,
  public.age_band,
  public.attendance_status,
  boolean,
  integer,
  boolean,
  boolean
) is
  'Kind defaults (Victor 2026-09-05): regular present −1, regular unexcused 0, regular excused 0; special present or unexcused −2, excused 0; cup/league −1 per competing player per Asia/Taipei calendar day. Admin override still wins. U6/reserve/adult/no_debit 0.';

revoke all on function public.compute_session_debit_plan(public.session_kind, public.age_band, public.attendance_status, boolean, integer, boolean, boolean) from public, anon;
grant execute on function public.compute_session_debit_plan(public.session_kind, public.age_band, public.attendance_status, boolean, integer, boolean, boolean) to authenticated;
