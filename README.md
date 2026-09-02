# squadbase

Responsive web + PWA scaffold for a football **Club** (球團) operations app: training squads, courses, attendance, assessments, and matches/events.

This repository is **Stage 0 only** — a runnable project skeleton. Business features, auth, RLS, and data migrations are intentionally not included.

Branding in code, package name, and this README is neutral (`Club` / `球團`). Do not add a real club name.

## Requirements

- Node.js 20.9 or later
- npm 10 or later

## How to run

```bash
cp .env.example .env.local
# Optional: add staging public values. The homepage still runs if they are empty.
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app redirects to a locale prefix:

- Traditional Chinese: `/zh-Hant`
- English: `/en`
- Japanese: `/ja`

Use the language switcher on the homepage to confirm sample copy updates.

## Checks

```bash
npm run lint
npm run typecheck
```

## Environment setup

Required public variable **names** (values stay in `.env.local`, never in git):

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL for the browser/server client skeleton |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous / publishable key |

Optional:

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_APP_ENV` | UI label only: `local`, `staging`, or `production` |

`.env.example` lists names only. Copy it to `.env.local` for local work.

**Never** add a service role key, database password, or any secret to this repo, to `NEXT_PUBLIC_*` variables, or to client code. The Stage 0 clients read only the two public variables above.

## Staging vs production

Keep environments separate:

| Environment | Use |
| --- | --- |
| `local` | Developer machines. Point at a staging Supabase project if you need real keys. |
| `staging` | Shared preview / QA. Own Supabase project, own deploy target. |
| `production` | Live club operations. Own Supabase project. **Human approval required before any production deploy.** |

CI on pull requests runs lint and typecheck only. It does **not** deploy.

Production deploy is out of scope for Stage 0 and **must not** be automated. A person has to review and approve any future production release.

## Project layout

```text
app/                 App Router routes, PWA manifest, global styles
  [locale]/          Locale-prefixed pages (zh-Hant, en, ja)
components/          Shared UI (language switcher, homepage)
i18n/                next-intl routing, navigation, request config
lib/supabase/        Browser and server client skeleton
messages/            zh-Hant, en, ja copy
public/icons/        Placeholder PWA icons
.github/workflows/   PR CI (lint + typecheck, no deploy)
```

## PWA

`app/manifest.ts` publishes a web app manifest. Placeholder icons live in `public/icons/`. Installability and offline caching are not Stage 0 goals.

## Out of scope (Stage 0)

- Phone OTP / auth flows
- RLS policies and business table migrations
- Player, parent, course, or match features
- Production deploys, merging to `main` from this scaffold PR, or deleting databases

## Later stages

Add auth, data, and club features on this folder structure. Keep staging and production isolated, and keep production releases behind human approval.
