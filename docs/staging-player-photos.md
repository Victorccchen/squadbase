# Stage P — player photos (staging Storage + SQL)

Photos are **private**. Do not create a public bucket. Do not deploy production. Do not paste service-role keys.

Staging project URL (public): `https://ffksqfgscuezjwdbktcd.supabase.co`

## What this adds

| Piece | Where |
| --- | --- |
| `players.photo_path`, `photo_updated_at`, `id_pdf_path` | [`supabase/migrations/20260912000000_stage_p_player_photos.sql`](../supabase/migrations/20260912000000_stage_p_player_photos.sql) |
| RPCs `can_read/write_player_photo`, `set_player_headshot`, `set_player_id_pdf` | same file |
| Private bucket `player-photos` + Storage RLS | same file |
| Privilege re-grant (if needed) | [`supabase/migrations/20260912010000_regrant_stage_p_privileges.sql`](../supabase/migrations/20260912010000_regrant_stage_p_privileges.sql) |
| SQL Editor checks | [`supabase/stage_p_verification.sql`](../supabase/stage_p_verification.sql) |

Who can **write**: admin, or an approved linked parent for that child. Assigned coaches **read** (signed URL) only.

## Apply on staging (Raw SQL Editor)

Use the **staging** Supabase project. Open **SQL Editor → New query**. Paste **file contents**, not a file path. Run in this order:

1. Entire contents of `supabase/migrations/20260912000000_stage_p_player_photos.sql`
2. Optional: entire contents of `supabase/migrations/20260912010000_regrant_stage_p_privileges.sql` if you see `permission denied` on the new RPCs
3. Entire contents of `supabase/stage_p_verification.sql` (it rolls back; expect a notice, not leftover rows)

If the Storage UI already has a bucket named `player-photos`, still run step 1: the `insert … on conflict` sets **Public = false**, MIME allowlist, and 8 MB limit, and (re)creates policies.

## Dashboard Storage check (after SQL)

1. **Storage → Buckets → `player-photos`**
2. **Public** must be **off**
3. Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
4. File size limit: **8 MB** (PDF cap). The Next.js app still rejects images over **5 MB**
5. Policies: `player_photos_select` (admin / approved guardian / assigned coach), `player_photos_insert/update/delete` (admin / approved guardian only)

Object keys look like `{player_uuid}/headshot-{ts}-{nonce}.jpg` or `{player_uuid}/id-document-{ts}-{nonce}.pdf`. Replacing a photo writes a **new** key (TP-4) and the previous object is deleted when the app can.

## App config

[`next.config.ts`](../next.config.ts) raises the Server Action body limit to `10mb` so an 8 MB PDF plus multipart overhead is accepted. Headshots are JPEG/PNG/WebP.

Signed read URLs are created on the server (1 hour). Public `/matches` and published lineups never request them.

## Admin ZIP (Stage P.1)

Admins download a league-registration pack from `/app/admin/reports` (scope by 梯隊 / 隊伍) or one-click from a **隊伍** detail page. The ZIP is assembled on the server from the private `player-photos` bucket: `roster.xlsx`, `manifest.csv`, `photos/`, and `pdfs/` when ID PDFs exist. Missing objects skip that file; the player stays on the roster. Parents and coaches cannot export.

## Out of scope

Auto ID-card PDF layout, face detect/crop, parent/coach batch download, ops dashboard, production deploy.
