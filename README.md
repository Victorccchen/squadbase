# squadbase

Responsive web + PWA for a football **Club** (球團) operations app: training squads, courses, attendance, assessments, and matches/events.

This repository is currently **Stage 3 plus lifecycle**: Stage 1 phone OTP login, Stage 2 admin-managed organization master data (teams, players, coaches, coach↔team assignments) and a read-only coach roster, **guardian–player binding with admin approval**, parent withdraw of a pending link, admin revoke of an approved link, and admin team deactivate / hard-delete of empty squads. Courses, attendance, assessments, and match management are not included.

Parents can request a link to an **existing** player (the club creates the player record first). Until an admin approves, the parent cannot read that player’s private fields. After approval, the parent sees a basic “my children” list (names, birth date, team, jersey). The parent may **withdraw a pending request**; only an **admin** may revoke an **approved** link. After revoke or withdraw, `is_approved_guardian_for_player` is false and the same pair may apply again. Later stages can reuse an **approved** link so a parent proxies course registration or match attendance — those flows are not built here.

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
| `/[locale]/app/admin/*` | Admin CRUD (teams, players, coaches) and binding approvals. Parents/coaches without admin see an access-denied page. |
| `/[locale]/app/roster` | Coach (or admin) read-only roster of assigned teams |

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

Stage 2 uses **active/inactive status** for day-to-day roster turnover. Membership and assignment foreign keys are `ON DELETE RESTRICT` on teams. Admins can **deactivate** a squad (it disappears from parent-facing active lists such as `list_active_teams_for_link`) without deleting history. **Hard delete** is allowed only when there are **no** `team_memberships` rows (active or inactive) and **no** `coach_team_assignments`. Players are never cascade-deleted. If memberships remain, deactivate instead (or move/end memberships first).

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

This row is the future parent-proxy gate: later course registration / attendance should check `status = 'approved'` for `(guardian, player)`. Those features are out of scope.

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

Steps:

1. Open the staging project: [Supabase Dashboard](https://supabase.com/dashboard/project/ffksqfgscuezjwdbktcd).
2. Go to **SQL Editor** → **New query**.
3. Paste the full contents of the migration file.
4. Run the query.
5. In **Table Editor**, confirm `teams`, `players`, `team_memberships`, `coaches`, `coach_team_assignments`, and (after Stage 3) `guardian_player_links` exist.

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

### How to verify the migration

- Table Editor shows the five Stage 2 tables above, with RLS enabled, plus `guardian_player_links` after Stage 3.
- After the player-name follow-up: `players` has `name_en_given` and `name_en_family` (required), `name_zh` and `name_ja` nullable, and no `name_en` column.
- Optional: paste [`supabase/stage2_verification.sql`](supabase/stage2_verification.sql). The jersey block asserts T2-2 (duplicate rejected) and T2-3 (same number on another team allowed), then `ROLLBACK` so it does not leave rows.
- Optional: paste [`supabase/stage3_verification.sql`](supabase/stage3_verification.sql) after substituting real profile UUIDs. The unique-index block asserts re-apply-after-reject and rolls back. The RLS block documents T3-4 / T3-5.
- Optional: paste [`supabase/lifecycle_verification.sql`](supabase/lifecycle_verification.sql) after substituting real profile UUIDs. Asserts re-apply-after-revoke, empty-team delete, and that active memberships block delete. Rolls back.
- Optional: the RLS block at the bottom of the Stage 2 file, with real user UUIDs.

There is **no seed data** and no real PII in the repo.

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

## RLS (Stage 2 + Stage 3)

- `anon`: no access to org tables or `guardian_player_links`; cannot read `birth_date`. Unauthenticated `/app` (including `/app/children`) redirects to login (T3-5).
- `parent` (no admin/coach): cannot read other profiles. Cannot `SELECT` `players` / `teams` / memberships **except**:
  - own rows in `guardian_player_links`;
  - after **approved**, that linked player’s basic row, their membership, and that team (for “my children”).
  - constrained search RPCs (`list_active_teams_for_link`, `search_player_for_guardian_link`) which do not dump the roster.
  - Insert own **pending** links only. Cannot set `approved` / `rejected` (T3-4). Can update **own pending** rows only to `revoked` (withdraw). Cannot revoke `approved`.
- `coach`: read assigned teams, memberships, and those players (including `birth_date`, needed to show age band on the roster). No insert/update/delete on org tables. Same parent-link rules if they also have the parent role (default).
- `admin`: full CRUD on org tables; can `select` all `profiles` in order to link coaches (phone is PII; admins can see it); can select all guardian links and call `admin_review_guardian_link` / `admin_revoke_guardian_link` / `admin_delete_team`. Team hard-delete refuses while **active** `team_memberships` remain; inactive memberships and coach assignments are removed with the team.

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

Locale check: switch zh-Hant / en / ja on children, bindings, admin, and roster screens; labels should change. Player **names** stay as entered.

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
app/[locale]/          Public home, /login, gated /app, /app/children, /app/admin, /app/roster
components/            Header, forms, dashboard cards, access denied
i18n/                  next-intl routing, navigation, request config
lib/age-band.ts        Season-start age band helper
lib/org/               Server actions, queries, display-name helper, binding actions
lib/auth/              Phone helpers, session/role guards
lib/supabase/          Browser, server, and proxy (cookie) clients
messages/              zh-Hant, en, ja copy
supabase/migrations/   SQL (apply on staging only)
.github/workflows/     PR CI (lint, typecheck, unit tests; no deploy)
```

Auth uses the official `@supabase/ssr` cookie pattern for Next.js, composed in `proxy.ts` with `next-intl` (Next.js 16 proxy, not the old `middleware.ts` filename). Server pages call `getUser()`; the proxy refreshes/validates with `getClaims()`. Clients receive only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## PWA

`app/manifest.ts` publishes a web app manifest. Placeholder icons live in `public/icons/`. Installability and offline caching are not Stage 3 goals.

## Out of scope (Stage 3)

- Courses, registrations, attendance, assessments, match/event CRUD (parent-proxy is designed for later, not implemented)
- Public match pages
- Payments
- Production deploys, merging this work to `main` from an agent, or modifying a production database
- Service role keys in the repo or in client code
- In-app admin backdoors or phone whitelists
- Seeding real personal data

## Later stages

Add courses, attendance, assessments, and matches on this folder structure. Gate parent-proxy on `guardian_player_links.status = 'approved'`. Keep staging and production isolated, and keep production releases behind human approval.
