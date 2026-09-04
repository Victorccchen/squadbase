# squadbase

Responsive web + PWA for a football **Club** (球團) operations app: training squads, courses, attendance, assessments, and matches/events.

This repository is currently **Stage 4B**: Stage 1–4A.1 plus **prepaid session credits** for fee-paying youth bands (U8 and U10–U18). Parents submit bank-transfer claims with the last five account digits; an admin approves to credit the player balance. Attendance marking deducts credits under locked kind rules. Admins can copy a trilingual LINE-group notice (manual paste into existing groups — no LINE Messaging API). U6, reserve, and adult sessions do not debit (UI label 不扣堂 / No debit).

Parents can request a link to an **existing** player (the club creates the player record first). Until an admin approves, the parent cannot read that player’s private fields. After approval, the parent sees a basic “my children” list (names, birth date, team, jersey) and may **register that child for training sessions** on the child’s team. The parent may **withdraw a pending request**; only an **admin** may revoke an **approved** link. After revoke or withdraw, `is_approved_guardian_for_player` is false and the same pair may apply again. Session signup checks `guardian_player_links.status = approved`.

Branding in code, package name, and this README is neutral (`Club` / `球團`). Do not add a real club name.

## Requirements

- Node.js 20.9 or later (unit tests use Node 22 type stripping; CI uses Node 22)
- npm 10 or later
- A **staging** Supabase project (never point this app at production while developing)

Public staging project URL (safe to store in docs):

`https://ffksqfgscuezjwdbktcd.supabase.co`

Keys stay in environment variables only. **Never** commit the anon key, the service role key, or any other secret.

## How to run locally

```bash
cp .env.example .env.local
```

In `.env.local` (not git):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ffksqfgscuezjwdbktcd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Dashboard → Project Settings → API Keys → anon / publishable>
NEXT_PUBLIC_APP_ENV=local
NEXT_PUBLIC_APP_URL=https://YOUR_APP_HOST
BANK_TRANSFER_HINT=
```

Then:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app always redirects `/` to Traditional Chinese (`/zh-Hant`). Other locales:

- Traditional Chinese: `/zh-Hant`
- English: `/en`
- Japanese: `/ja`

Routes:

| Path | Who |
| --- | --- |
| `/[locale]` | Public homepage |
| `/[locale]/login` | Phone OTP sign-in |
| `/[locale]/app` | Signed-in dashboard |
| `/[locale]/app/children` | Parent: linked children, request status, constrained search form |
| `/[locale]/app/sessions` | Parent: upcoming sessions for linked children’s teams, register / cancel / switch, Q&A, excused leave |
| `/[locale]/app/credits` | Parent: remaining credits, 10/20/30 pack claim with last-5 digits |
| `/[locale]/app/admin/*` | Admin CRUD (teams, players, coaches, sessions), binding approvals, payment claims, packages. Parents/coaches without admin see an access-denied page. |
| `/[locale]/app/roster` | Coach (or admin) roster of assigned teams, session signups, and attendance |

## Checks (CI)

Pull request CI runs **lint + typecheck + unit tests** (age-band and form parse helpers). It does **not** deploy.

```bash
npm run lint
npm run typecheck
npm test
```

## Schema choice (Stage 2)

Players do **not** store a primary `team_id`. Membership and jersey number live on `team_memberships`:

- `UNIQUE (team_id, jersey_number)` — same number may exist on another team
- `UNIQUE (player_id, team_id)` — a player cannot be listed twice on one team
- Jersey numbers are integers 1–99

The Stage 2 admin player form keeps **at most one membership row per player** (create/update reuses that row). The table can hold more than one membership later without another migration.

Jersey uniqueness is a **full** unique constraint, including inactive memberships (hypothesis: do not silently reuse a number while the row still exists). Stage 2 has no hard-delete UI; change the number or mark the player/membership inactive without freeing the number until the membership row is removed in SQL.

Stage 2 uses **active/inactive status** for day-to-day roster turnover. Membership and assignment foreign keys are `ON DELETE RESTRICT` on teams. Admins can **deactivate** a squad (it disappears from parent-facing active lists such as `list_active_teams_for_link`) without deleting history. **Hard delete** is allowed when there are **no active** `team_memberships`. Inactive/ended memberships and `coach_team_assignments` are removed in the same `admin_delete_team` transaction. Players are never cascade-deleted. If **active** memberships remain, the admin list shows a zh-Hant (and en/ja) reason next to Delete and in the confirm dialog; move or end those memberships first, or keep the team deactivated.

`coaches.profile_id` is 1:1 with `profiles` (and therefore `auth.users`). `coach_team_assignments(coach_id, team_id)` controls which squads a coach may read.

Age band is stored on **teams** (the squad’s intended band). It is **not** stored on players. The app computes a suggested band from `birth_date` and the 15 August season rule (see below).

Player names:

- `name_en_given` and `name_en_family` are both required (English given + family).
- `name_zh` and `name_ja` are optional, but **at least one** must be non-empty (database `CHECK` + form validation).
- UI display prefers the name for the active locale if it is filled; otherwise English “Given Family”; otherwise the other filled CJK name.

## Schema choice (Stage 3)

`guardian_player_links` is the only binding table:

| Column | Purpose |
| --- | --- |
| `guardian_user_id` | The signed-in parent’s `profiles.id` (same UUID as `auth.users`) |
| `player_id` | Existing `players.id` (club-created; parents do not create players) |
| `relation` | `parent` / `guardian` / `other` |
| `status` | `pending` / `approved` / `rejected` / `revoked` |
| `parent_note` | Optional note from the parent (max 1000 chars) |
| `admin_note` | Optional decision note from the admin |
| `reviewed_by` / `reviewed_at` | Set only when status leaves `pending` |
| `created_by` / `updated_by` / timestamps | Same actor pattern as Stage 2 |

**Hypothesis (locked for this stage):** at most one **open** link per `(guardian_user_id, player_id)` — meaning pending or approved. Rejected and **revoked** rows are kept as history. After a reject, parent withdraw, or admin revoke, the parent may insert a new pending row. A player may have more than one approved guardian (two parents). Parents must **not** revoke an approved link; only an admin may.

This row is the parent-proxy gate: session registration (Stage 4) checks `status = 'approved'` for `(guardian, player)`.

## Schema choice (Stage 4)

Training sessions are independent events under an existing **team** (梯隊). They are not courses, not prepaid, and have **no capacity limit** in this stage.

| Table | Purpose |
| --- | --- |
| `training_sessions` | `team_id`, `starts_at`, `ends_at`, optional `location` / `notes`, `status` `active`/`inactive` (same pattern as org status) |
| `session_registrations` | Auto-approved signup: `registered` or `cancelled`. Optional `parent_note` (one-way to the club). Unique **open** row per `(session_id, player_id)` where `status = registered` |
| `session_registration_messages` | Q&A thread on a registration. `author_role` is `parent` or `admin` |

**Hypothesis (locked):** inactive sessions are not offered for new parent signup. After cancel, the same child may **re-register** on the same session while it stays `active` (cancelled rows are history; they do not occupy the unique index). A player may have only one open registration per session; if two approved guardians exist, either may see/cancel/post on that registration. Times are stored as `timestamptz` and edited as Asia/Taipei wall time (`+08:00`; Taiwan has no DST). Signup UI lists sessions that are `active` and have not yet ended (`ends_at` in the future).

Parents never receive a full session or roster dump: they only see sessions on teams of their **approved** children. Writes go through security-definer RPCs (`register_player_for_session`, `cancel_session_registration`, `switch_session_registration`, `post_session_registration_message`). Coaches may `SELECT` sessions and registrations on assigned teams (roster page). Admins CRUD sessions and see the roster plus Q&A.

Out of scope: payments / prepaid sessions / LINE OA, attendance, assessments, hard capacity / waitlist, production deploy.

## Schema choice (Stage 4A)

Stage 4A extends sessions with a required **title**, a **kind**, optional **series**, and **soft-delete**. Parent auto-approve, no capacity limit, notes, and Q&A stay as in Stage 4.

| Addition | Purpose |
| --- | --- |
| `session_kind` | `regular` / `special` / `cup` / `league` |
| `session_series` | Shared title/kind/location/notes for generated occurrences. `deleted_at` for series soft-delete |
| `training_sessions.title` | Required. Parents see this on signup lists |
| `training_sessions.kind` | Copied from the series at create |
| `training_sessions.series_id` | Nullable FK to `session_series` |
| `training_sessions.deleted_at` | Admin soft-delete. Hidden from new parent signup. Registrations and Q&A stay |
| `training_sessions.is_playoff` | Per-occurrence flag; only allowed when `kind = league`. No auto playoff bracket |

**Hypothesis (locked for this stage):** `admin_create_session_series` generates occurrences in one security-definer RPC (safer than a client loop). `special` creates exactly one occurrence. Recurring kinds (`regular`, `cup`, `league`) require **end date XOR week count**. **N weeks = N occurrences including the first.** Maximum 52 occurrences per create; over that is an error and no write. Inactive status still temporarily hides a session from new signup without deleting it.

`guardian_can_read_session` lets parents read active **non-deleted** sessions on teams of approved children, **or** any session they already registered for (including after a later soft-delete). New signup RPCs reject deleted or inactive sessions.

Writes for create and soft-delete are admin-only RPCs. Coaches keep read on assigned-team sessions (including history). Parents keep register/cancel/Q&A only.

Out of scope for 4A (Stage 4B): payments, prepaid packages, attendance deduction, LINE OA/group copy, push notifications. No auto-generated playoff bracket.

## Schema choice (Stage 4A.1)

Stage 4A.1 extends recurrence so a regular/cup/league series can meet on **more than one weekday**, and replaces the admin sessions long list with a **month calendar + day agenda**.

| Addition | Purpose |
| --- | --- |
| `session_series.weekdays` | `smallint[]`, ISO-8601 **1=Monday … 7=Sunday**. Null for `special` / legacy series |
| `admin_create_session_series(..., p_weekdays)` | Optional last argument. `NULL` infers a one-element array from `p_starts_at`’s Taipei weekday (Stage 4A callers). `{}` is rejected |

**Hypothesis (locked):** week-count **N means N occurrences per selected weekday**, including the first of that weekday on or after the series start date. Total occurrences = sum across weekdays, still **max 52** (reject the entire create if over). Until-date: every calendar date in `[startDate, untilDate]` whose weekday is selected, at the chosen time of day. `special` is unchanged (exactly one occurrence; weekday multi-select is hidden). Parent `/app/sessions` stays a list. No drag-reschedule, no parent calendar, no restore-from-soft-delete UI.

Calendar dots use CSS tokens: regular=blue (`--session-kind-regular`), special=amber (`--session-kind-special`), cup=purple (`--session-kind-cup`), league=green (`--session-kind-league`). The right-hand day panel groups by team (U bands / reserve / adult / ungrouped).

Out of scope remains Stage 4 parent registration rules. Stage 4B adds credits without changing calendar/multi-weekday behaviour.

## Schema choice (Stage 4B)

Prepaid credits for fee-paying youth bands. Signup still does **not** pre-debit. Cancel before attendance: no debit.

| Object | Purpose |
| --- | --- |
| `session_packages` | Catalog by `U8` / `U10_U18`, credits, TWD price, active. Seeded from 2026-09-01 |
| `player_session_balances` | Remaining credits + weighted average unit cost |
| `session_credit_ledger` | Immutable entries: purchase, attend_debit, no_show_debit, match_debit, admin_adjust, reversal |
| `payment_claims` | Parent last-5 claim; pending → approved (credits the balance) or rejected |
| `session_attendance` | Unique `(session_id, player_id)`; present / excused_absent / unexcused_absent |
| `session_leave_requests` | Excused leave on a registration; pending until admin approves (0 debit) |
| `training_sessions.no_debit` / `debit_override_n` | Admin per-session edge cases |
| `club_runtime_settings.bank_transfer_hint` | Admin-editable transfer copy. Fallback: `BANK_TRANSFER_HINT` env. Never commit a real account |

**Who pays:** U8 and U10–U18 (package from the player’s current team age band). **No credit MVP:** U6, reserve, adult/senior — attendance does not debit; UI label 不扣堂.

**Kind defaults:** regular present/unexcused −1; special present or unexcused −2 (excused leave 0); cup/league competing player −1 per club calendar day; reserve/adult/U6/no_debit 0. Insufficient balance blocks present and debiting unexcused outcomes.

**RLS (conservative):** parents see own claims and balances for approved-linked players only (not the money ledger). Admins see all. Coaches may read remaining credits and write attendance on assigned teams; they cannot approve claims or select ledger/last-5. Writes for approve/adjust/attendance debit go through security-definer RPCs in one transaction.

Out of scope: online card gateways, LINE Messaging API auto-send, personal LINE binding, push notifications, merging to main from an agent, production deploy.

### Player discovery (search UX)

Parents must **not** receive a full roster dump. They never `SELECT` from `players` until an approved link exists.

**Chosen UX (hypothesis):** a constrained search that requires **multiple fields**, implemented as `search_player_for_guardian_link` (security definer RPC):

1. **Team + exact jersey** (unique per team, so 0–1 match), and/or
2. **Exact birth date + name fragment** (at least two characters; `ILIKE` against English given/family, zh, ja, and “Given Family”). `%` and `_` in the fragment are escaped.

If both modes are complete, results must satisfy **both** (AND). If neither mode is complete, the function returns no rows. At most five rows. Team names for the dropdown come from `list_active_teams_for_link` (active squad names only — not player PII).

A successful search may show names / DOB / team / jersey so the parent can confirm before submitting. That confirmation is RPC output, not a table `SELECT` on `players`. Pending/rejected parents still cannot read the player row from “my children”.

**Residual risk:** an authenticated parent who knows a team can try jersey numbers 1–99. Documented; not rate-limited in Stage 3. Birth date + name is the stronger mode. Phone OTP still required to get an account.

## Apply migrations (staging only)

Do **not** run this SQL on production.

Apply in order:

1. [`supabase/migrations/20260902100000_stage1_profiles_and_roles.sql`](supabase/migrations/20260902100000_stage1_profiles_and_roles.sql) (skip if Stage 1 is already on staging)
2. [`supabase/migrations/20260902120000_stage2_org_master.sql`](supabase/migrations/20260902120000_stage2_org_master.sql) (skip if Stage 2 is already on staging)
3. [`supabase/migrations/20260902140000_players_split_english_names.sql`](supabase/migrations/20260902140000_players_split_english_names.sql) (player name columns; **paste this file if Stage 2 is already applied**)
4. [`supabase/migrations/20260902160000_stage3_guardian_player_links.sql`](supabase/migrations/20260902160000_stage3_guardian_player_links.sql) (**Stage 3; paste this file on staging**)
5. [`supabase/migrations/20260902180000_regrant_stage3_privileges.sql`](supabase/migrations/20260902180000_regrant_stage3_privileges.sql) (**Stage 3 follow-up; paste this even if Stage 3 already ran** — repairs GRANT on `guardian_player_links`, `teams`, and the Stage 3 RPCs. Does not change RLS.)
6. [`supabase/migrations/20260902200000_link_status_add_revoked.sql`](supabase/migrations/20260902200000_link_status_add_revoked.sql) (**lifecycle step 1; paste this file and wait for it to finish** — adds `link_status.revoked`. PostgreSQL cannot use a new enum value in the same transaction that added it.)
7. [`supabase/migrations/20260902220000_lifecycle_revoke_and_team_delete.sql`](supabase/migrations/20260902220000_lifecycle_revoke_and_team_delete.sql) (**lifecycle step 2; paste only after step 1 committed** — parent cancel pending, admin revoke approved, `admin_delete_team`)
8. [`supabase/migrations/20260902240000_regrant_lifecycle_privileges.sql`](supabase/migrations/20260902240000_regrant_lifecycle_privileges.sql) (**paste if admins see `permission denied for table teams`** — re-grants `teams`, `team_memberships`, `coach_team_assignments`, `players`, `guardian_player_links` to `authenticated`. Does not change RLS. Safe to re-run even if step 7 already included a teams GRANT.)
9. [`supabase/migrations/20260902260000_admin_delete_team_active_only.sql`](supabase/migrations/20260902260000_admin_delete_team_active_only.sql) (**paste this so delete works** — `admin_delete_team` blocks only on **active** memberships; inactive memberships and coach assignments are removed in the same transaction. Also re-grants `teams` / memberships / assignments.)
10. [`supabase/migrations/20260903000000_stage4_training_sessions.sql`](supabase/migrations/20260903000000_stage4_training_sessions.sql) (**Stage 4; paste this file on staging** — sessions, registrations, Q&A, RPCs/RLS. Also replaces `admin_delete_team` so hard-delete removes sessions.)
11. [`supabase/migrations/20260903020000_regrant_stage4_privileges.sql`](supabase/migrations/20260903020000_regrant_stage4_privileges.sql) (**paste if parents/admins see `permission denied` on `training_sessions` or Stage 4 RPCs** — re-grants tables/functions to `authenticated`. Does not change RLS.)
12. [`supabase/migrations/20260904000000_stage4a_session_kinds_series.sql`](supabase/migrations/20260904000000_stage4a_session_kinds_series.sql) (**Stage 4A; paste this file on staging** — `session_kind`, `session_series`, session `title` / `kind` / `series_id` / `deleted_at` / `is_playoff`, `admin_create_session_series`, `admin_soft_delete_session`, `admin_soft_delete_session_series`. Also updates `guardian_can_read_session`, `register_player_for_session`, and `admin_delete_team`.)
13. [`supabase/migrations/20260904020000_regrant_stage4a_privileges.sql`](supabase/migrations/20260904020000_regrant_stage4a_privileges.sql) (**paste if admins see `permission denied` on `session_series` or Stage 4A RPCs** — re-grants tables/functions to `authenticated`. Does not change RLS.)
14. [`supabase/migrations/20260905000000_stage4a1_multi_weekday_series.sql`](supabase/migrations/20260905000000_stage4a1_multi_weekday_series.sql) (**Stage 4A.1; paste this file on staging** — `session_series.weekdays`, replaces `admin_create_session_series` with `p_weekdays smallint[]` ISO 1=Mon … 7=Sun.)
15. [`supabase/migrations/20260905020000_regrant_stage4a1_privileges.sql`](supabase/migrations/20260905020000_regrant_stage4a1_privileges.sql) (**paste if admins see `permission denied` after the 4A.1 RPC signature change** — re-grants the new `admin_create_session_series` overload. Does not change RLS.)
16. [`supabase/migrations/20260906000000_stage4b_session_credits.sql`](supabase/migrations/20260906000000_stage4b_session_credits.sql) (**Stage 4B; paste this file’s CONTENTS on staging** — packages, balances, immutable ledger, payment claims, attendance, leave requests, debit RPCs. Seeds the 2026-09-01 TWD catalog. Does not change 4A/4A.1 recurrence.)
17. [`supabase/migrations/20260906020000_regrant_stage4b_privileges.sql`](supabase/migrations/20260906020000_regrant_stage4b_privileges.sql) (**paste if parents/admins/coaches see `permission denied` on credit tables or Stage 4B RPCs** — re-grants to `authenticated`. Does not change RLS. Safe to re-run.)

Steps:

1. Open the staging project: [Supabase Dashboard](https://supabase.com/dashboard/project/ffksqfgscuezjwdbktcd).
2. Go to **SQL Editor** → **New query**.
3. Paste the full contents of the migration file.
4. Run the query.
5. In **Table Editor**, confirm `teams`, `players`, `team_memberships`, `coaches`, `coach_team_assignments`, `guardian_player_links`, and (after Stage 4) `training_sessions`, `session_registrations`, `session_registration_messages` exist. After Stage 4A, also confirm `session_series` and that `training_sessions` has `title`, `kind`, `series_id`, `deleted_at`, and `is_playoff`. After Stage 4A.1, confirm `session_series.weekdays`. After Stage 4B, confirm `session_packages`, `player_session_balances`, `payment_claims`, `session_credit_ledger`, `session_attendance`, `session_leave_requests`, and `club_runtime_settings`.

If you use the Supabase CLI and it is linked to **staging** (never production):

```bash
supabase db push
```

If an earlier Stage 2 draft was already applied, run the Stage 2 file again. It is written to be re-runnable (`create table if not exists`, `create or replace function`, `drop policy if exists`). Re-running is required to pick up `GRANT USAGE` on `age_band` and `org_status`; without those grants, admin inserts can fail with “permission denied for type”.

The player-name follow-up (`20260902140000_players_split_english_names.sql`) is also written to be re-runnable. **Staging that already has Stage 2 must apply this file** (SQL Editor paste is enough). Do not run it on production.

Stage 3 (`20260902160000_stage3_guardian_player_links.sql`) is written to be re-runnable (`create table if not exists`, `create or replace function`, `drop policy if exists`). Apply it on **staging only**.

The privilege follow-up (`20260902180000_regrant_stage3_privileges.sql`) is also re-runnable. **Staging that already has Stage 3 must apply this file** if parents or admins see `permission denied for table guardian_player_links` or `permission denied for function list_active_teams_for_link`. It only re-grants table/function privileges to `authenticated` (and revokes them from `anon` / `public`). It does not change RLS.

The lifecycle pair must be pasted as **two separate SQL Editor runs**. First `20260902200000_link_status_add_revoked.sql` (adds the enum value). After that query succeeds, paste `20260902220000_lifecycle_revoke_and_team_delete.sql`. Do not concatenate them into one query. Staging that already has Stage 3 still needs both files. Do not run them on production.

If an admin opening `/app/admin/teams` still sees `permission denied for table teams` in logs (empty list or failed load), paste [`supabase/migrations/20260902240000_regrant_lifecycle_privileges.sql`](supabase/migrations/20260902240000_regrant_lifecycle_privileges.sql) in the staging SQL Editor. It only repairs GRANT on org tables (and lifecycle RPCs if those functions already exist). It does not change RLS. Safe to re-run.

If Delete on a deactivated team does nothing useful (or fails because ended memberships / coach assignments remain), paste [`supabase/migrations/20260902260000_admin_delete_team_active_only.sql`](supabase/migrations/20260902260000_admin_delete_team_active_only.sql). That replaces `admin_delete_team` so only **active** memberships block, and ended memberships plus coach assignments are deleted with the team.

Stage 4 (`20260903000000_stage4_training_sessions.sql`) is written to be re-runnable (`create table if not exists`, `create or replace function`, `drop policy if exists`). Apply it on **staging only**. After it runs, `admin_delete_team` also removes `training_sessions` for that team (registrations and messages cascade). The privilege follow-up (`20260903020000_regrant_stage4_privileges.sql`) is also re-runnable and does not change RLS.

Stage 4A.1 (`20260905000000_stage4a1_multi_weekday_series.sql`) replaces `admin_create_session_series` (drops the old 10-argument signature, adds `p_weekdays`). Apply it on **staging only**, after Stage 4A. The privilege follow-up (`20260905020000_regrant_stage4a1_privileges.sql`) is re-runnable and does not change RLS.

**How to apply on staging:** open the staging project SQL Editor, then paste the **file contents** of each migration (not the path string) and run. Do not run these files against production.

Stage 4B (`20260906000000_stage4b_session_credits.sql`) is written to be re-runnable. **Victor: paste the SQL file contents into the staging SQL Editor, not a path string.** Then paste the regrant file. Do not run them on production. Do not put real bank account numbers, LINE tokens, or service-role keys in git.

### How to verify the migration

- Table Editor shows the five Stage 2 tables above, with RLS enabled, plus `guardian_player_links` after Stage 3.
- After the player-name follow-up: `players` has `name_en_given` and `name_en_family` (required), `name_zh` and `name_ja` nullable, and no `name_en` column.
- Optional: paste [`supabase/stage2_verification.sql`](supabase/stage2_verification.sql). The jersey block asserts T2-2 (duplicate rejected) and T2-3 (same number on another team allowed), then `ROLLBACK` so it does not leave rows.
- Optional: paste [`supabase/stage3_verification.sql`](supabase/stage3_verification.sql) after substituting real profile UUIDs. The unique-index block asserts re-apply-after-reject and rolls back. The RLS block documents T3-4 / T3-5.
- Optional: paste [`supabase/lifecycle_verification.sql`](supabase/lifecycle_verification.sql) after substituting real profile UUIDs. Asserts re-apply-after-revoke, empty-team delete, and that active memberships block delete. Rolls back.
- Optional: paste [`supabase/stage4_verification.sql`](supabase/stage4_verification.sql). The unique-index block asserts re-register-after-cancel and rolls back. The RLS notes document T4-5 / T4-6.
- Optional: paste [`supabase/stage4a_verification.sql`](supabase/stage4a_verification.sql) after Stage 4A. Asserts title/kind insert, re-register-after-cancel, and that soft-delete keeps registration rows. Rolls back.
- Optional: paste [`supabase/stage4a1_verification.sql`](supabase/stage4a1_verification.sql) after Stage 4A.1. Asserts `session_series.weekdays` and the `p_weekdays` RPC signature exist. Rolls back.
- Optional: paste [`supabase/stage4b_verification.sql`](supabase/stage4b_verification.sql) after Stage 4B. Asserts debit-plan C2–C5 (regular 1, special unexcused 2 / excused 0, cup 1/day, U6/reserve/senior 0). Rolls back.
- Optional: the RLS block at the bottom of the Stage 2 file, with real user UUIDs.

The package catalog is **seeded with TWD prices from 2026-09-01** (no personal data, no bank account numbers). There is **no real PII** in the repo.

## Age band (15 August season start)

Helper: [`lib/age-band.ts`](lib/age-band.ts). Tests: [`lib/age-band.test.ts`](lib/age-band.test.ts) (`npm test`).

**Rule (hypothesis, documented as the product default):**

1. Take an “as of” calendar date (default: today in `Asia/Taipei`).
2. Season start is **15 August of that year** if as-of ≥ 15 Aug; otherwise **15 August of the previous year**.
3. Compute completed years of age on that season-start date.
4. Map age to a band:

| Completed age on season start | Band |
| --- | --- |
| 0–5 | U6 |
| 6–7 | U8 |
| 8–9 | U10 |
| 10–11 | U12 |
| 12–14 | U15 |
| 15–17 | U18 |
| 18+ | senior |

`reserve` is a **team classification** (reserve squad). The helper never returns `reserve`.

Boundary examples (T2-4), as of 2026:

| Birth date | As of | Season start | Age | Band |
| --- | --- | --- | --- | --- |
| 2020-08-15 | 2026-08-15 | 2026-08-15 | 6 | U8 |
| 2020-08-15 | 2026-08-14 | 2025-08-15 | 5 | U6 |
| 2020-08-16 | 2026-08-15 | 2026-08-15 | 5 | U6 |
| 2008-08-15 | 2026-08-15 | 2026-08-15 | 18 | senior |
| 2008-08-16 | 2026-08-15 | 2026-08-15 | 17 | U18 |

The player form and player detail screen show the suggested band. Saving is still allowed if it does not match the team’s band.

## Enable Phone Auth (staging Dashboard)

Login cannot complete until both Phone Auth and an SMS provider are configured. **Already-logged-in admin sessions can exercise Stage 2 CRUD without sending a new OTP.** New coach/parent accounts still need SMS/OTP once.

1. Open [Authentication → Providers](https://supabase.com/dashboard/project/ffksqfgscuezjwdbktcd/auth/providers).
2. Enable **Phone**.
3. Choose an **SMS provider** and save credentials there (not in this repo).
4. Confirm the sender can deliver to your test country (Taiwan `+886` is the in-app default).

If SMS is not configured, the login UI still runs, but you cannot create a session.

## Promote the first admin (manual)

New users default to `parent`. The first admin is **not** created in app code.

After the person has signed in once (so they have a `profiles` row):

### Option A — SQL Editor

```sql
insert into public.user_roles (user_id, role, created_by, updated_by)
values ('USER_UUID', 'admin', 'USER_UUID', 'USER_UUID')
on conflict (user_id, role) do nothing;
```

### Option B — Table Editor

Insert into `user_roles` with `role = admin`.

They keep `parent` and also become `admin`. Reload `/app`.

## Link a coach (Stage 2)

1. The coach signs in once with phone OTP (creates `profiles` + default `parent` role).
2. An admin opens **Admin → Coaches → Link coach**, chooses that profile, and saves.
3. `admin_link_coach` (security definer) creates/activates `coaches` and inserts `user_roles.role = coach`.
4. The admin assigns one or more teams. The coach then sees those squads on `/app/roster`.

Do not grant extra roles from the browser except through this admin action. RLS still forbids client inserts into `user_roles`.

## RLS (Stage 2 + Stage 3 + Stage 4)

- `anon`: no access to org tables or `guardian_player_links`; cannot read `birth_date`. Unauthenticated `/app` (including `/app/children`) redirects to login (T3-5).
- `parent` (no admin/coach): cannot read other profiles. Cannot `SELECT` `players` / `teams` / memberships **except**:
  - own rows in `guardian_player_links`;
  - after **approved**, that linked player’s basic row, their membership, and that team (for “my children”).
  - constrained search RPCs (`list_active_teams_for_link`, `search_player_for_guardian_link`) which do not dump the roster.
  - Insert own **pending** links only. Cannot set `approved` / `rejected` (T3-4). Can update **own pending** rows only to `revoked` (withdraw). Cannot revoke `approved`.
- `coach`: read assigned teams, memberships, and those players (including `birth_date`, needed to show age band on the roster). No insert/update/delete on org tables. Same parent-link rules if they also have the parent role (default).
- `admin`: full CRUD on org tables and `training_sessions`; can `select` all `profiles` in order to link coaches (phone is PII; admins can see it); can select all guardian links and call `admin_review_guardian_link` / `admin_revoke_guardian_link` / `admin_delete_team`. Team hard-delete refuses while **active** `team_memberships` remain; inactive memberships, coach assignments, and training sessions are removed with the team. Admins can reply on `session_registration_messages`.
- Training sessions: parents `SELECT` only sessions they can read via approved children (or existing registrations, including after soft-delete). `register_player_for_session` requires an approved guardian, an **active non-deleted** session, and an active membership of that player on the session’s team. Parents cannot dump another family’s roster. Coaches `SELECT` sessions/registrations/messages on assigned teams. `anon` has no GRANT. Create and soft-delete go through admin-only RPCs.

Public match pages that show names without dates of birth are a later stage. This stage does not expose player rows to unauthenticated users.

## Test steps

Use staging. Do not use a production project.

### Stage 1 (still required for new sessions)

| ID | Check |
| --- | --- |
| T1-1 | Signed out, open `/zh-Hant/app`. Redirect to that locale’s login. |
| T1-2 | Valid OTP → dashboard. `profiles` row exists; `user_roles` contains `parent`. |
| T1-3 | Wrong or expired OTP → error; stay signed out. |
| T1-4 | Sign out → `/app` redirects to login. |
| T1-5 | User A cannot read user B’s profile/phone. See [`supabase/rls_verification.sql`](supabase/rls_verification.sql). |
| T1-6 | `npm run lint` and `npm run typecheck` pass. |

### Stage 2

SMS/OTP is required to **create** a session (or a second user such as a coach/parent). An **already-logged-in admin** can do T2-1–T2-4 in the UI without a new code.

| ID | Check |
| --- | --- |
| T2-1 | Admin creates a team, then a player with English given + family and at least one of zh/ja, DOB, team, jersey → saved. Suggested age band appears on the form/detail. |
| T2-2 | Same jersey on the same team → rejected (UI error and/or DB `23505`). |
| T2-3 | Same jersey on a different team → allowed. |
| T2-4 | Age-band examples around 15 Aug: `npm test` and the table above. |
| T2-5 | Coach assigned to team A sees A on `/app/roster`, not team B. Coach cannot use admin CRUD (`/app/admin` shows access denied). |
| T2-6 | Parent (no coach/admin) opening `/app/admin` or `/app/admin/teams/new` sees access denied, not the forms. |
| T2-7 | `npm run lint`, `npm run typecheck`, and `npm test` pass. |
| T2-8 | Player names: EN given + EN family required; zh and ja optional but at least one required. Create fails if both CJK names are empty, or if either English given or family is empty. Create succeeds with EN+ZH only and with EN+JA only. Display prefers the UI-locale name if present, then English “Given Family”, then the other filled CJK name. |

### Stage 3

Use **one admin account** and **one parent account**. The parent needs a **second phone** (or a second number that can receive SMS) because login is phone OTP. An already-logged-in admin can create the player and review bindings without a new code.

**Hypothesis:** the admin account also has the default `parent` role, so it can open `/app/children` as well. Do not use that path for T3-1–T3-4; those checks need a non-admin parent so RLS is actually exercised.

| ID | Check |
| --- | --- |
| T3-1 | Parent searches (team + jersey, or DOB + name fragment ≥ 2 chars) → sees a confirmation card (not a full roster) → submits → link is `pending`. “My children” still has no player names. |
| T3-2 | Admin rejects (optional note). Parent sees `rejected` and the admin note. Nested player details stay hidden. |
| T3-3 | Parent re-applies (allowed after reject) → admin approves → parent sees the child on “my children” (names, birth date, team, jersey). |
| T3-4 | Parent cannot approve their own link: no approve UI on `/app/children`; `/app/admin/bindings` is access denied; SQL `UPDATE … status = 'approved'` as that user affects 0 rows. See [`supabase/stage3_verification.sql`](supabase/stage3_verification.sql). |
| T3-5 | Signed out, open `/zh-Hant/app/children`. Redirect to that locale’s login. |
| T3-6 | `npm run lint`, `npm run typecheck`, and `npm test` pass. |
| T3-7 | Parent withdraws a **pending** request on `/app/children` (cancel). Status becomes `revoked` (history stays). No cancel/revoke control on an **approved** child card. A crafted cancel of an approved id is rejected (`cannotRevokeApproved` / RLS). |
| T3-8 | Admin revokes an **approved** link on `/app/admin/bindings` (optional note). Parent loses “my children” PII for that player (`is_approved_guardian_for_player` is false). The same pair can submit a new pending request. |
| T2-9 | Admin deactivates a team on `/app/admin/teams/[id]`. The squad disappears from the parent link team dropdown (`list_active_teams_for_link`). Reactivate brings it back. |
| T2-10 | On `/app/admin/teams`, each row has Edit, Deactivate/Reactivate, and **Delete**. Inactive team with **no active memberships** (ended memberships/coach assignments OK): confirm delete succeeds. Team with **active memberships**: amber reason + roster link next to Delete; confirm repeats the reason; team stays. Inactive status alone does not block delete. |

Wrong-search check (not a numbered T3, but part of “no PII dump”): a parent who omits fields, or uses a jersey that does not exist, gets no player list.

### Stage 4

Use **one admin account** and **one parent account** with an **approved** guardian link (the second-phone parent from Stage 3). Inactive sessions must not appear on `/app/sessions`.

| ID | Check |
| --- | --- |
| T4-1 | Admin creates a session on a team (for example Futuro U8) from `/app/admin/sessions/new`. It appears in the admin list with roster count 0. |
| T4-2 | Second-phone parent with an approved child registers with an optional note. Status is auto-registered; the parent sees confirmation; the note is saved. |
| T4-3 | Parent cancels. Admin roster count drops. Parent may re-register the same session while it stays active. |
| T4-4 | Parent posts a Q&A question on the registration. Admin replies on the session roster. Parent sees the reply. |
| T4-5 | Parent without a binding, or with pending-only, cannot register (no signup list / RPC `not an approved guardian`). |
| T4-6 | Admin deactivates a session. It is hidden from parent signup. |
| T4-7 | Signed out, `/zh-Hant/app/admin/sessions` redirects to login. A signed-in non-admin sees access denied and the page does not query org tables before the gate. |
| T4-8 | `npm run lint`, `npm run typecheck`, and `npm test` pass. |

Locale check: switch zh-Hant / en / ja on sessions, admin sessions, and roster session blocks.

### Stage 4A

Use an admin account. Recurrence math is also covered by `npm test` (`lib/org/session-recurrence.test.ts`).

| ID | Check |
| --- | --- |
| T4A-1 | Admin creates a **special** session with a title → exactly 1 row. Parent signup list shows the title. |
| T4A-2 | Admin creates **regular** with an end date (not week count) → weekly same weekday/time through that date. |
| T4A-3 | Admin creates **regular** with week count 4 only → exactly 4 sessions including the first. Filling both end date and weeks is rejected. |
| T4A-4 | Recurring kind with neither end date nor weeks → validation error, no rows written. |
| T4A-5 | Admin creates **cup** and **league** series. Editing a league occurrence can set **playoff**; parent and admin lists show the playoff badge. No bracket is generated. |
| T4A-6 | Admin soft-deletes a session. It disappears from parent `/app/sessions`. Admin list with “Include deleted” still shows it. Registrations and Q&A remain on the admin detail. |
| T4A-7 | Signed-in non-admin cannot open create/soft-delete (access denied). Parent JWT cannot call `admin_create_session_series` / `admin_soft_delete_session`. |

Locale check: switch zh-Hant / en / ja on create form validation, kind badges, filters, and soft-delete confirm.

### Stage 4A.1

Use an admin account. Multi-weekday math is covered by `npm test` (`lib/org/session-recurrence.test.ts`). Calendar grouping is covered by `lib/org/session-calendar.test.ts`.

| ID | Check |
| --- | --- |
| T4A1-1 | Admin creates **regular** with Tue+Thu and week count 4 → 4 Tuesdays + 4 Thursdays (8 total, same series/title). Start date’s weekday is not the only generator. |
| T4A1-2 | Admin creates **regular** with Wednesday + until date (no week count) → every Wednesday in `[start, until]` at the chosen time. |
| T4A1-3 | Recurring kind with no weekday selected → validation error, no rows written. Over 52 total occurrences is rejected. |
| T4A1-4 | Admin `/app/admin/sessions` defaults to month calendar. Click a day → right panel shows only that day. Kind-colored dots + legend. Same-day multi-team rows group by team (U bands / reserve / adult). Kind and team filters and include-deleted work. |
| T4A1-5 | **special** still creates exactly one occurrence (no weekday multi-select). Parent `/app/sessions` stays a list. |

Locale check: weekdays, calendar legend, empty day, and validation (no weekday / over 52) in zh-Hant / en / ja.

### Stage 4B

Use **one admin**, **one non-admin parent** (approved guardian of a U8 or U10–U18 child), and optionally a **coach** on that team. Debit math is also covered by `npm test` (`lib/credits/debit-rules.test.ts`). LINE copy is covered by `lib/credits/notice.test.ts`.

Paste Stage 4B SQL **file contents** (not path strings) on **staging only** before UI checks.

| ID | Check |
| --- | --- |
| C1 | Parent submits a **10-pack** claim with last-5 → admin approves on `/app/admin/claims` → that child’s balance is **+10**. Parent `/app/credits` shows remaining credits, not the full ledger. |
| C2 | Admin/coach marks **regular present** → **−1**. With balance 0, marking present is blocked (`insufficientCredits`). |
| C3 | **special** unexcused → **−2**. Approved excused leave → **0** debit. |
| C4 | **cup** or **league** competing player → **−1 per day** (second same-day match does not double-debit). |
| C5 | **reserve** / **adult** / **U6** sessions show 不扣堂 / No debit; attendance does **not** debit prepaid credits. |
| C6 | Admin session detail **複製通知** includes a signup URL in zh-Hant, en, ja, and the combined block. Copy buttons only — no LINE API. |
| C7 | Non-admin cannot approve claims (`/app/admin/claims` access denied; RPC `not authorized`). Coach can take attendance on assigned teams but cannot see claim last-5 / amounts. Parent cannot see another family’s child balances. Diff has no secrets, bank numbers, LINE tokens, or service-role keys. |

Locale check: packages, claims, attendance, last-5 error, leave, notice templates, empty states in zh-Hant / en / ja.

## Staging vs production

| Environment | Use |
| --- | --- |
| `local` | Developer machines. Point `.env.local` at the **staging** Supabase project. |
| `staging` | Shared QA. Own Supabase project (`ffksqfgscuezjwdbktcd`). |
| `production` | Live club operations. Own Supabase project. **Human approval required before any production deploy.** |

CI on pull requests does **not** deploy.

**Do not treat merging this work as a production release.** A person has to review, apply SQL only to the intended project, and approve any future production release.

## Project layout

```text
app/[locale]/          Public home, /login, gated /app, /app/children, /app/sessions, /app/credits, /app/admin, /app/roster
components/            Header, forms, dashboard cards, access denied
i18n/                  next-intl routing, navigation, request config
lib/age-band.ts        Season-start age band helper
lib/credits/           Debit rules, packages, LINE notice copy, credit queries/actions
lib/org/               Server actions, queries, display-name helper, binding actions
lib/auth/              Phone helpers, session/role guards
lib/supabase/          Browser, server, and proxy (cookie) clients
messages/              zh-Hant, en, ja copy
supabase/migrations/   SQL (apply on staging only)
.github/workflows/     PR CI (lint, typecheck, unit tests; no deploy)
```

Auth uses the official `@supabase/ssr` cookie pattern for Next.js, composed in `proxy.ts` with `next-intl` (Next.js 16 proxy, not the old `middleware.ts` filename). Server pages call `getUser()`; the proxy refreshes/validates with `getClaims()`. Clients receive only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## PWA

`app/manifest.ts` publishes a web app manifest. Placeholder icons live in `public/icons/`. Installability and offline caching are not Stage 4A goals.

## Out of scope (Stage 4B)

- Online card / payment gateways
- LINE Messaging API auto-send, official account binding, or push notifications
- Changing Stage 4/4A/4A.1 calendar, multi-weekday series, soft-delete, or auto-approve registration
- Full contribution report UI beyond admin totals on `/app/admin/credits`
- Production deploys, merging this work to `main` from an agent, or modifying a production database
- Service role keys, real bank account numbers, or LINE tokens in the repo or in client code
- In-app admin backdoors or phone whitelists
- Seeding real personal data

## Later stages

Keep staging and production isolated, and keep production releases behind human approval. Assessments, public match pages, and richer contribution reports can follow on this folder structure.
