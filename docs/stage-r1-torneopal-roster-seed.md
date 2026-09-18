# Stage R1 — Seed Torneopal FUTURO roster (zh name + jersey)

Staging only. Do not run against production. Do not commit service role keys or the real youth roster CSV.

Victor decided: write players from **Chinese names + jersey numbers** now. English names and real birthdates come later.

## What this does

1. Ensures 隊伍 exist: **Futuro U8 / U9 / U10 / U11 / U12 黃 / U12 藍** (U10 白/藍 collapse to `Futuro U10`).
2. Reads a Torneopal CSV and upserts players:
   - Match existing rows by **zh full name** (do not duplicate).
   - Cross-listed Torneopal names → **one player**, up to two 隊伍 (max-two / no same-band dual).
   - Jersey is stored on the **competition team** membership.
   - 梯隊 membership is required by schema; uses the CSV 梯隊 and a free jersey (prefers the 隊伍 number).
3. Placeholders required by today’s schema:
   - `name_en_given` = `Pending`
   - `name_en_family` = `Pending` (do **not** invent romanizations)
   - Birthdate: documented age-band placeholder so the player lands in the matching 梯隊
   - Marker (report + English/DOB placeholders): `Torneopal seed; birthdate placeholder; replace with real DOB`

Placeholder DOBs (as of season start 15 Aug 2026):

| Birth label | Date | 梯隊 |
| --- | --- | --- |
| U8 | 2018-08-15 | U8 |
| U9 | 2017-08-15 | U10 |
| U10 | 2016-08-15 | U10 |
| U11 | 2015-08-15 | U12 |
| U12 | 2014-08-15 | U12 |

If a matched player already has a **real** English name or DOB, those fields are kept. Membership/jersey still update. A real DOB that cannot sit on the CSV 梯隊/隊伍 is an error (not overwritten).

Real children’s names are **not** stored in git. Copy the attached 87-row file locally.

## CSV columns

```text
torneopal_team,competition_team,age_squad,jersey_number,zh_family_name,zh_given_name,zh_full_name,source
```

Example (fictional 測試 names only): [`data/staging/torneopal-futuro-players.example.csv`](../data/staging/torneopal-futuro-players.example.csv)

## Apply on staging

1. Paste [`supabase/migrations/20260918010000_stage_r1_futuro_competition_teams.sql`](../supabase/migrations/20260918010000_stage_r1_futuro_competition_teams.sql) **contents** in the staging SQL Editor. Optional check: [`supabase/stage_r1_verification.sql`](../supabase/stage_r1_verification.sql) (rolls back).
2. Put the real 87-row CSV on the machine (do not commit it), for example:

   ```bash
   cp /path/to/torneopal-futuro-players.csv data/staging/torneopal-futuro-players.csv
   ```

3. In `.env.local` (not git):

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://ffksqfgscuezjwdbktcd.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<Dashboard → API Keys → service_role>
   NEXT_PUBLIC_APP_ENV=staging
   ```

   The script never prints the key. It **refuses** any URL that is not the staging project ref `ffksqfgscuezjwdbktcd`, and refuses `NEXT_PUBLIC_APP_ENV=production`.

4. Dry-run (default) prints `created / updated / skipped / errors`:

   ```bash
   npm run seed:torneopal-roster -- --csv data/staging/torneopal-futuro-players.csv
   ```

5. Write:

   ```bash
   npm run seed:torneopal-roster -- --csv data/staging/torneopal-futuro-players.csv --apply
   ```

Optional: `--emit-admin-csv /tmp/players-6a.csv` writes a Stage 6A **create-only** player template (Pending names). That path does **not** upsert; use `--apply` for matching existing zh names.

The script uses the **service role** because `admin_set_player_*` RPCs require an admin JWT (`auth.uid()`). Table writes still hit the membership trigger (one 梯隊, max two 隊伍, layer_key, birth eligibility, jersey unique).

## Out of scope

- Production deploy or merge to `main` from the agent
- Inventing English romanizations or real birthdates
- Guardian import, photos, matches
- Secrets in git
