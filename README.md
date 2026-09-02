# squadbase

Responsive web + PWA for a football **Club** (球團) operations app: training squads, courses, attendance, assessments, and matches/events.

This repository is currently **Stage 2**: Stage 1 phone OTP login plus admin-managed organization master data (teams, players, coaches, coach↔team assignments) and a read-only coach roster. Guardian linking, courses, attendance, assessments, and match management are not included.

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
| `/[locale]/app/admin/*` | Admin CRUD (teams, players, coaches). Parents/coaches without admin see an access-denied page. |
| `/[locale]/app/roster` | Coach (or admin) read-only roster of assigned teams |

## Checks (CI)

Pull request CI runs **lint + typecheck + age-band unit tests**. It does **not** deploy.

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

`coaches.profile_id` is 1:1 with `profiles` (and therefore `auth.users`). `coach_team_assignments(coach_id, team_id)` controls which squads a coach may read.

Age band is stored on **teams** (the squad’s intended band). It is **not** stored on players. The app computes a suggested band from `birth_date` and the 15 August season rule (see below).

## Apply migrations (staging only)

Do **not** run this SQL on production.

Apply in order:

1. [`supabase/migrations/20260902100000_stage1_profiles_and_roles.sql`](supabase/migrations/20260902100000_stage1_profiles_and_roles.sql) (skip if Stage 1 is already on staging)
2. [`supabase/migrations/20260902120000_stage2_org_master.sql`](supabase/migrations/20260902120000_stage2_org_master.sql)

Steps:

1. Open the staging project: [Supabase Dashboard](https://supabase.com/dashboard/project/ffksqfgscuezjwdbktcd).
2. Go to **SQL Editor** → **New query**.
3. Paste the full contents of the migration file.
4. Run the query.
5. In **Table Editor**, confirm `teams`, `players`, `team_memberships`, `coaches`, and `coach_team_assignments` exist.

If you use the Supabase CLI and it is linked to **staging** (never production):

```bash
supabase db push
```

### How to verify the migration

- Table Editor shows the five tables above, with RLS enabled.
- Optional: paste [`supabase/stage2_verification.sql`](supabase/stage2_verification.sql). The jersey block uses `ROLLBACK` so it does not leave rows. Uncomment the duplicate-jersey insert to confirm it fails with `23505`.
- Optional: the RLS block at the bottom of that file, with real user UUIDs.

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

## RLS (Stage 2)

- `anon`: no access to org tables; cannot read `birth_date`.
- `parent` (no admin/coach): cannot read other profiles, and cannot read `players` / `teams` / memberships. Birth dates are not visible because no player rows are returned.
- `coach`: read assigned teams, memberships, and those players (including `birth_date`, needed to show age band on the roster). No insert/update/delete on org tables.
- `admin`: full CRUD on org tables; can `select` all `profiles` in order to link coaches (phone is PII; admins can see it).

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
| T2-1 | Admin creates a team, then a player with zh/en/ja names, DOB, team, jersey → saved. Suggested age band appears on the form/detail. |
| T2-2 | Same jersey on the same team → rejected (UI error and/or DB `23505`). |
| T2-3 | Same jersey on a different team → allowed. |
| T2-4 | Age-band examples around 15 Aug: `npm test` and the table above. |
| T2-5 | Coach assigned to team A sees A on `/app/roster`, not team B. Coach cannot use admin CRUD (`/app/admin` shows access denied). |
| T2-6 | Parent (no coach/admin) opening `/app/admin` or `/app/admin/teams/new` sees access denied, not the forms. |
| T2-7 | `npm run lint`, `npm run typecheck`, and `npm test` pass. |

Locale check: switch zh-Hant / en / ja on admin and roster screens; labels should change. Player **names** stay as entered; roster prefers the name for the active UI locale.

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
app/[locale]/          Public home, /login, gated /app, /app/admin, /app/roster
components/            Header, forms, dashboard cards, access denied
i18n/                  next-intl routing, navigation, request config
lib/age-band.ts        Season-start age band helper
lib/org/               Server actions, queries, display-name helper
lib/auth/              Phone helpers, session/role guards
lib/supabase/          Browser, server, and proxy (cookie) clients
messages/              zh-Hant, en, ja copy
supabase/migrations/   SQL (apply on staging only)
.github/workflows/     PR CI (lint, typecheck, unit tests; no deploy)
```

Auth uses the official `@supabase/ssr` cookie pattern for Next.js, composed in `proxy.ts` with `next-intl` (Next.js 16 proxy, not the old `middleware.ts` filename). Server pages call `getUser()`; the proxy refreshes/validates with `getClaims()`. Clients receive only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## PWA

`app/manifest.ts` publishes a web app manifest. Placeholder icons live in `public/icons/`. Installability and offline caching are not Stage 2 goals.

## Out of scope (Stage 2)

- Guardian–player linking (Stage 3)
- Courses, registrations, attendance, assessments, matches/events management
- Public match pages
- Payments
- Production deploys, merging this work to `main` from an agent, or modifying a production database
- Service role keys in the repo or in client code
- In-app admin backdoors or phone whitelists
- Seeding real personal data

## Later stages

Add guardian links, courses, attendance, assessments, and matches on this folder structure. Keep staging and production isolated, and keep production releases behind human approval.
