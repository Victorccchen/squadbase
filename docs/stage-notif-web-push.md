# Stage Notif — Web Push (staging)

Admins can send PWA Web Push from the existing Stage N notice flow (template → audience → preview), in addition to copy-to-LINE. Parents opt in on `/app/settings` with **test accounts**.

**Do not apply this SQL on production. Do not set VAPID keys on a production Vercel project. Do not send push in production until Victor confirms.**

## VAPID on Vercel staging (`squadbase-staging`)

1. On a trusted machine (not committed):

   ```bash
   npx web-push generate-vapid-keys
   ```

2. In the **squadbase-staging** Vercel project → Settings → Environment Variables, add to **Production** (that environment **is staging**):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the **public** key |
   | `VAPID_PRIVATE_KEY` | the **private** key |
   | `VAPID_SUBJECT` | `mailto:staging-push@localhost` (or a staging contact) |
   | `NEXT_PUBLIC_APP_ENV` | `staging` |

3. Redeploy so `NEXT_PUBLIC_*` is baked in.

Never paste real keys into git, PR comments, or chat. The private key must not be `NEXT_PUBLIC_*`.

Local `.env.local` can use the same **staging** pair. `NEXT_PUBLIC_APP_ENV=production` blocks send in app code.

## Staging SQL (Raw editor)

Paste **file contents**, not path strings, on the staging Supabase project only:

1. [`supabase/migrations/20260919020000_stage_notif_web_push.sql`](../supabase/migrations/20260919020000_stage_notif_web_push.sql)
2. [`supabase/migrations/20260919030000_regrant_stage_notif_privileges.sql`](../supabase/migrations/20260919030000_regrant_stage_notif_privileges.sql) if you see `permission denied`

Optional check (rolls back): [`supabase/stage_notif_verification.sql`](../supabase/stage_notif_verification.sql)

## iOS “Add to Home Screen”

iPhone/iPad Web Push only works after the parent:

1. Opens the **staging** site in Safari (not an in-app browser).
2. Share → **Add to Home Screen**.
3. Launches the Home Screen icon (standalone PWA).
4. Signs in with a **test parent** account and enables push on Settings.

Desktop Chrome/Firefox and Android Chrome can subscribe without that step (HTTPS required).

## Test-account QA (staging)

Use one admin and one non-admin parent (approved guardian). Do not use production phones or production env.

1. Parent (test account) → `/zh-Hant/app/settings` → enable push → allow notifications.
2. Admin → `/zh-Hant/app/admin/notices` → pick a session → preview shows **intended / subscribed / skipped**.
3. Admin taps **推播**. Parent device shows a short title + body; tap opens the Stage N deep link.
4. Parent disables push → preview skipped count increases; send skips that user.
5. Two approved children for the same parent → one intended user (dedupe).
6. Coach-only account is not in the audience unless they are also an approved guardian.
7. Non-admin opening notices stays access denied; send is admin-only.

Payloads must not include phones, street addresses, or full rosters.

## Out of scope

- Production env / production send
- LINE Official Account / Messaging API / SMS / email
- Coach-as-recipient by default
- Auto-retry storms
