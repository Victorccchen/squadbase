# 官網公開 API 合約 v1（`site_*`）

官網（`Victorccchen/futuro-fc-site`）只能呼叫本文件列出的 RPC。定義在 `supabase/migrations/20261009110000_site_public_api_v1.sql`，行為由 `supabase/site_public_api_verification.sql` 驗證，anon 白名單由 `supabase/anon_surface_verification.sql` 驗證。

## 規則

- `site_api_version()` 回傳 `1`。只有**破壞性變更**（刪欄位、改名、改型別、改語意）才升版；新增欄位不升版，官網要忽略不認得的欄位。
- 要刪除或改名欄位：先改官網、部署，再改 RPC，然後升版。
- Squadbase 的 PR 只要動到 `site_*`、`match_publications` 的公開欄位或 anon 權限，PR 說明要標註「影響官網」。
- 所有 `site_*` 都是 `security definer`，anon 和 authenticated 可以執行。新的資料表 anon 一律讀不到。
- 時間都是 `timestamptz`（ISO 8601，UTC）。日期判斷（賽季範圍、比賽日年齡）用 `Asia/Taipei`。

## 比賽

### `site_list_matches(p_season_id uuid default null, p_team_id uuid default null)`

回傳整季，不限 90 天，依 `starts_at`、`id` 排序。

- 沒給 `p_season_id`：用目前賽季（`seasons.is_current`）。比對方式：`season_id` 等於該賽季，或 `season_id` 為空但比賽日落在賽季日期內。
- 沒有目前賽季：回傳所有可見比賽。
- `p_team_id`：只回傳該隊。

可見條件：`is_published`、session 為 active、未軟刪除、比賽類型（league／cup／friendly）。**四種狀態都會回傳**：`scheduled`、`postponed`、`completed`、`cancelled`。

### `site_get_match(p_id uuid)`

欄位和 `site_list_matches` 相同。看不到時回傳 0 列。

### 比賽欄位

| 欄位 | 說明 |
|---|---|
| `id` | 比賽（training_sessions）id |
| `team_id`、`team_name`、`team_age_band` | 一線隊是 `senior` |
| `kind`、`is_playoff` | `league`／`cup`／`friendly` |
| `starts_at`、`ends_at` | 直播判斷：`scheduledEnd = max(ends_at, starts_at + 150 分)` |
| `location` | 舊的自由文字地點；有 `public_venue_id` 時以場地資料為準 |
| `opponent`、`opponent_club_id` | 文字名稱一定有；有 club id 時用 `site_list_clubs` 的資料 |
| `side` | `home`／`away` |
| `public_status` | `scheduled`／`postponed`／`completed`／`cancelled` |
| `club_score`、`opponent_score`、`result_note` | 只有 `completed` 有值 |
| `result_entered_at` | 管理員輸入比分的時間；`liveEnd = min(result_entered_at + 15 分, scheduledEnd)` |
| `season_id`、`competition_id`、`round_no`、`round_label` | 賽季、賽事、輪次 |
| `public_venue_id` | 對應 `site_list_venues` |
| `live_video_id`、`replay_video_id`、`highlights_video_id` | YouTube 影片 id（11 碼）。**只有 `scheduled`、`completed` 回傳**，延期、取消一律是 null |
| `embed_enabled` | false 時只顯示「到 YouTube 觀看」連結，不嵌入 |
| `live_window_before_min` | 直播開始前幾分鐘進入直播狀態；null 用官網預設 |
| `updated_at` | 比賽或公開資訊最後修改時間 |

不回傳：原始貼上的網址、`embed_check_status`、`video_title`、`training_sessions.venue_id`。

### `site_list_match_roster(p_id uuid)`

`jersey_number`、`name_zh`、`name_ja`、`name_en_given`、`name_en_family`。

- 只回傳 `senior`、`reserve` 隊伍的比賽，青訓比賽回傳 0 列。
- 只回傳比賽日（台北時間）已滿 18 歲的球員。
- 不回傳 `player_id`。

## 參考資料

| RPC | 欄位 | 備註 |
|---|---|---|
| `site_list_clubs()` | `id, slug, name_zh, name_ja, name_en, short_zh, short_en, abbr, crest_path, home_venue_id, website_url, instagram_url, facebook_url, youtube_url, is_self` | `crest_path` 只在隊徽授權為 `granted` 時回傳，否則官網用 `abbr` 徽章 |
| `site_list_venues()` | `id, slug, name_zh, name_ja, name_en, address_zh, address_en, lat, lng, map_url, transit_*, parking_*, accessibility_zh, capacity, surface` | 不回傳 `training_venue_id` |
| `site_list_seasons()` | `id, label, starts_on, ends_on, is_current` | 新到舊 |
| `site_list_competitions()` | `id, slug, name_zh, name_ja, name_en, short, kind, organizer` | `kind`：league／cup／continental／friendly |
| `site_get_standings(p_season_id default null, p_competition_id default null)` | `season_id, competition_id, after_round, club_id, rank, played, won, drawn, lost, goals_for, goals_against, points, is_official, source_url, fetched_at` | 每個賽事只回傳最新一輪；`rank` 可以並列；`is_official = false` 時標示「非官方」 |

## 管理端（不給官網用）

`admin_postpone_match`、`admin_set_match_broadcast`、`admin_set_match_listing`，以及修改過的 `admin_cancel_match`（保留公開）、`admin_restore_match`（保留公開狀態）、`admin_set_match_result`（記錄 `result_entered_at`，延期中不能輸入）。只有 admin 能呼叫。

## 和 Squadbase 現有公開頁的差異

Squadbase 的 `/matches` 繼續用 `list_published_matches`，行為不變：只列 `scheduled`、`completed`，最近 90 天以後。取消和延期的比賽只在官網顯示。
