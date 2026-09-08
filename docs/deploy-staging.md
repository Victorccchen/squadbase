# Staging Continuous Deployment (Vercel)

This repo is a Next.js App Router app. Vercel’s **Next.js** framework preset is enough: there is **no** `vercel.json` on purpose. Prefer project defaults over a checked-in override.

**Product lock (Victor 2026-09-07)**

| Surface | Policy |
| --- | --- |
| Staging | Auto-deploy from `main` on Vercel |
| Production | **Manual only.** Do not enable auto-prod deploy. Do not deploy production from this work. |
| Secrets | Never in git or PR bodies. No Supabase service role, no real bank account numbers, no OTP / SMS provider secrets. |

Do **not** point a public production club domain at this staging project until Victor approves.

## Vercel-ready defaults (already in the repo)

| Setting | Value | Where it lives |
| --- | --- | --- |
| Framework preset | **Next.js** (auto-detected) | Vercel project settings — do not override |
| Build command | `npm run build` (`next build`) | [`package.json`](../package.json) `scripts.build` |
| Install command | Vercel default (`npm install` / lockfile) | leave default |
| Output | Next.js defaults (do **not** set an Output Directory) | leave default |
| Node | **22** (matches GitHub CI) | [`.nvmrc`](../.nvmrc); `engines.node` is `>=20.9.0` |
| Root directory | repository root | leave `.` |

GitHub Actions remains the quality gate (lint, typecheck, unit tests). It **must not deploy**. Prefer Vercel’s GitHub integration so nobody puts a Vercel token in this repo or in Actions secrets.

## Connect GitHub → Import (Victor clicks)

The agent does **not** create the Vercel project. Victor does this once in the dashboard.

1. Open [Vercel](https://vercel.com/) and sign in with the GitHub account that can see `Victorccchen/squadbase`.
2. If prompted, install / authorize the **Vercel GitHub App** and grant access to **`Victorccchen/squadbase`** (this org/user repo only is enough).
3. **Add New… → Project**.
4. **Import** `Victorccchen/squadbase`.
5. Name the project something like **`squadbase-staging`**. Treat this project as **staging only**.
6. Confirm:
   - **Framework Preset:** Next.js
   - **Build Command:** `npm run build` (default; do not need to toggle Override)
   - **Output Directory:** empty / Next.js default
   - **Root Directory:** `.`
7. **Git → Production Branch = `main`.**  
   On a dedicated staging project this is the usual pattern: Vercel’s “Production” deployment of `main` **is** the staging URL. That is **not** club production.
8. Leave **automatic deployments from `main` on**. Do **not** attach a second production project, and do **not** turn on auto-deploy for a public club domain.
9. Add environment variables (next section) **before** the first deploy if you already have the staging anon key. You can also deploy first, then add them and Redeploy.
10. Click **Deploy**. Wait for the first deployment. Copy the URL (for example `https://squadbase-staging.vercel.app`).

Optional: ignore or disable Preview deployments for feature branches if they are noisy. The intended staging URL is this project’s Production deployment of `main`.

## Environment variables (names and placeholders only)

Paste **real staging values only in the Vercel dashboard** (Project → Settings → Environment Variables). Apply them to **Production** on `squadbase-staging` (that environment is staging). Do not commit them. Do not paste them into the PR.

Match [`.env.example`](../.env.example):

| Name | Placeholder / how to obtain | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Staging project URL only (already public in `.env.example` / README). Do not use a production Supabase URL. | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard → Project Settings → API Keys → **anon / publishable** (never the service role) | Yes |
| `NEXT_PUBLIC_APP_ENV` | `staging` | Recommended |
| `NEXT_PUBLIC_APP_URL` | `https://YOUR_VERCEL_STAGING_HOST` (no trailing slash). Set this **after** the first deploy once you know the URL. | Yes after first URL is known |
| `BANK_TRANSFER_HINT` | empty, or a **non-account** placeholder such as `Ask the club admin for the staging transfer note`. Admins can also save copy in-app (`club_runtime_settings`). Never a real account number. | Optional |

Never add:

- `SUPABASE_SERVICE_ROLE_KEY` or any service role
- SMS / OTP provider API keys (those stay in the Supabase dashboard)
- LINE tokens
- Real bank codes or account numbers
- Vercel tokens in GitHub Actions

`NEXT_PUBLIC_*` values are baked into the client bundle. After you change them, **Redeploy** (Deployments → ⋯ → Redeploy) so the new values appear.

If `NEXT_PUBLIC_APP_URL` is empty, signup-link copy can fall back to Vercel’s `VERCEL_URL` (see `getAppOrigin()` in [`lib/env.ts`](../lib/env.ts)). Still set the explicit public origin after the first deploy so LINE-group links stay stable.

## After the first deploy: app URL + Supabase Auth allow-list

Phone OTP does not use email magic-link redirects, but the **Site URL** and **Redirect URLs** must include the Vercel origin so Auth cookies and any future redirect flows stay on staging.

### 1. Set `NEXT_PUBLIC_APP_URL`

1. Vercel → `squadbase-staging` → **Settings → Environment Variables**.
2. Set `NEXT_PUBLIC_APP_URL` to `https://<your-staging-host>` with **no trailing slash** (example shape: `https://squadbase-staging.vercel.app`).
3. **Deployments →** latest deployment **⋯ → Redeploy**.

### 2. Allow that origin in Supabase Auth (staging project only)

Use the **staging** Supabase project. Do **not** change a production Auth config.

1. Open the staging project: [Supabase Dashboard](https://supabase.com/dashboard/project/ffksqfgscuezjwdbktcd).
2. Go to **Authentication → URL Configuration** (sometimes listed under Authentication → Settings).
3. **Site URL:** paste `https://<your-staging-host>` (same origin as `NEXT_PUBLIC_APP_URL`).
4. **Redirect URLs → Add:**
   - `https://<your-staging-host>/**`
   - keep local dev if you already use it, for example `http://localhost:3000/**`
5. Save.

Do not paste anon keys, service role keys, or SMS credentials into this allow-list screen — it only needs origins.

### 3. Smoke-check (no production)

- Open `https://<your-staging-host>/zh-Hant` — homepage should render.
- `/zh-Hant/login` should show the OTP form (SMS still depends on the existing staging Phone Auth provider).
- Signed-out `/zh-Hant/app` should redirect to login.

## GitHub CI vs Vercel build

| Gate | What it does | Deploys? |
| --- | --- | --- |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | `npm ci`, lint, typecheck, unit tests on PRs and on `main` | **No** |
| Vercel Git integration | `npm run build` after a push to `main` | Staging project only |

Vercel will build even if you do not duplicate the CI job there. Do **not** add a custom “deploy with `VERCEL_TOKEN`” workflow.

Merging a PR into `main` is what triggers staging CD **after** this project is connected. Production stays a later, manual approval.

## PR checklist (staging CD)

When reviewing app PRs after Vercel is connected:

- [ ] GitHub CI is green (lint / typecheck / test).
- [ ] No secrets, service role keys, real bank hints, or OTP secrets in the diff or PR body.
- [ ] Merge to `main` will auto-deploy **staging** only.
- [ ] Production remains **manual approval** — this merge is not a production release.
- [ ] Do not attach a public club domain to `squadbase-staging` without Victor’s approval.

Player photos (Stage P): after merge, apply [`docs/staging-player-photos.md`](staging-player-photos.md) on the **staging** Supabase project (SQL Editor paste + private `player-photos` bucket). Do not apply on production.
