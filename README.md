# squadbase

Responsive web + PWA for a football **Club** (球團) operations app: training squads, courses, attendance, assessments, and matches/events.

This repository is currently **Stage 1**: phone OTP login/logout, profiles, a multi-role model, basic RLS, and role-aware dashboard placeholders. Business features are not included.

Branding in code, package name, and this README is neutral (`Club` / `球團`). Do not add a real club name.

## Requirements

- Node.js 20.9 or later
- npm 10 or later
- A **staging** Supabase project (never point this app at production while developing Stage 1)

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
| `/[locale]/app` | Signed-in dashboard (redirects to login if signed out) |

## Checks (CI)

Pull request CI runs **lint + typecheck only**. It does **not** deploy.

```bash
npm run lint
npm run typecheck
```

## Apply the Stage 1 migration (staging only)

Do **not** run this SQL on production.

1. Open the staging project: [Supabase Dashboard](https://supabase.com/dashboard/project/ffksqfgscuezjwdbktcd).
2. Go to **SQL Editor** → **New query**.
3. Paste the full contents of [`supabase/migrations/20260902100000_stage1_profiles_and_roles.sql`](supabase/migrations/20260902100000_stage1_profiles_and_roles.sql).
4. Run the query.
5. In **Table Editor**, confirm `profiles` and `user_roles` exist.

If you use the Supabase CLI and it is linked to **staging** (never production):

```bash
supabase db push
```

The migration creates:

- `public.profiles` (1:1 with `auth.users`)
- `public.user_roles` with roles `parent` | `coach` | `admin` | `player` (`player` is reserved; no player login UX)
- timestamps plus `created_by` / `updated_by`
- a trigger that, on new `auth.users` rows, creates a profile and assigns default role `parent`
- `ensure_own_profile()` for first login if the user already existed
- RLS: signed-in users can read/update only their own profile, read only their own roles, and cannot read others’ phone/profile. `anon` has no table access.

## Enable Phone Auth (staging Dashboard)

Login cannot complete until both Phone Auth and an SMS provider are configured.

1. Open [Authentication → Providers](https://supabase.com/dashboard/project/ffksqfgscuezjwdbktcd/auth/providers).
2. Enable **Phone**.
3. Choose an **SMS provider** and save credentials there (not in this repo):
   - Twilio (common): Account SID, Auth Token, and a Messaging Service SID **or** a From phone number
   - Also supported by Supabase Auth: MessageBird, Vonage, TextLocal
4. Confirm the sender can deliver to your test country (Taiwan `+886` is the in-app default).
5. Optional: tighten Auth rate limits and enable CAPTCHA before any production use.

Notes:

- Supabase allows a new OTP about once every 60 seconds; codes expire (commonly within ~1 hour, but treat them as short-lived).
- Twilio trial accounts usually send only to verified destination numbers.
- WhatsApp OTP is not used in this app (SMS only).
- There is **no** hardcoded admin backdoor and **no** staging phone whitelist in app code.

If SMS is not configured, the login UI still runs: requesting a code shows a clear blocker, and submitting a fake code exercises the invalid-OTP path (T1-3) without creating a session.

## Promote the first admin (manual)

New users default to `parent`. The first admin is **not** created in app code.

After the person has signed in once (so they have a `profiles` row):

### Option A — SQL Editor

1. **Authentication → Users** → copy the user’s UUID.
2. **SQL Editor** → run (staging only):

```sql
insert into public.user_roles (user_id, role, created_by, updated_by)
values ('USER_UUID', 'admin', 'USER_UUID', 'USER_UUID')
on conflict (user_id, role) do nothing;
```

They keep `parent` and also become `admin` (multi-role). Reload `/app` to see admin placeholders.

### Option B — Table Editor

1. **Table Editor** → `user_roles` → **Insert**.
2. `user_id`: the auth user UUID.
3. `role`: `admin`.
4. `created_by` / `updated_by`: the same UUID (optional but preferred).
5. Save.

To add `coach` later, insert another row with `role = 'coach'`. Do not grant extra roles from the client; RLS forbids user-driven inserts into `user_roles`.

## Test steps

Use staging. Do not use a production project.

| ID | Check |
| --- | --- |
| T1-1 | Signed out, open `/zh-Hant/app` (or `/en/app`). You are redirected to that locale’s login. |
| T1-2 | Valid OTP → dashboard. `profiles` row exists; `user_roles` contains `parent`. |
| T1-3 | Wrong or expired OTP → error message; you stay signed out (`/app` still redirects to login). |
| T1-4 | Sign out → session cookies clear; `/app` redirects to login. |
| T1-5 | User A cannot read user B’s profile/phone. Paste [`supabase/rls_verification.sql`](supabase/rls_verification.sql) into the SQL Editor, fill in two UUIDs, and run the statements. Expected: own row counts ≥ 1, other-user counts = 0, `anon` counts = 0. |
| T1-6 | `npm run lint` and `npm run typecheck` pass. |

Locale check: switch zh-Hant / en / ja on the homepage and login screen; copy should change.

## Staging vs production

| Environment | Use |
| --- | --- |
| `local` | Developer machines. Point `.env.local` at the **staging** Supabase project. |
| `staging` | Shared QA. Own Supabase project (`ffksqfgscuezjwdbktcd`). |
| `production` | Live club operations. Own Supabase project. **Human approval required before any production deploy.** |

CI on pull requests runs lint and typecheck only. It does **not** deploy.

**Do not merge Stage 1 as an automatic production release.** A person has to review, apply SQL only to the intended project, and approve any future production release.

## Project layout

```text
app/[locale]/          Public home, /login, gated /app dashboard
components/            Header, phone OTP form, dashboard placeholders
i18n/                  next-intl routing, navigation, request config
lib/auth/              Phone helpers, server actions, session/RLS-facing loaders
lib/supabase/          Browser, server, and proxy (cookie) clients
messages/              zh-Hant, en, ja copy
supabase/migrations/   Stage 1 SQL (apply on staging only)
.github/workflows/     PR CI (lint + typecheck, no deploy)
```

Auth uses the official `@supabase/ssr` cookie pattern for Next.js, composed in `proxy.ts` with `next-intl` (Next.js 16 proxy, not the old `middleware.ts` filename). Server pages call `getUser()`; the proxy refreshes/validates with `getClaims()`. Clients receive only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## PWA

`app/manifest.ts` publishes a web app manifest. Placeholder icons live in `public/icons/`. Installability and offline caching are not Stage 1 goals.

## Out of scope (Stage 1)

- Guardian–player linking, players CRUD, courses, attendance, assessments, matches
- Payments
- Production deploys, merging this work to `main` from an agent, or modifying a production database
- Service role keys in the repo or in client code
- In-app admin backdoors or phone whitelists

## Later stages

Add club operations features on this folder structure. Keep staging and production isolated, and keep production releases behind human approval.
