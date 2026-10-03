# Futuro 2026/27 資料匯入（官網用）

把 Grok-Bot 蒐集的公開資料（`data/futuro/G1–G6`）轉成 staging 用的 SQL：對手隊伍、公開場地、一線隊 2026/27 台企甲賽程、積分榜、已結束比賽的重播影片。

- 原始 CSV：`data/futuro/`（只放公開資料；`raw/` 的 PDF 和 G7–G10 沒有放進 repo）。
- 產生腳本：`scripts/import-futuro-data.mjs`
- 產生的 SQL：`supabase/seeds/futuro_2026_27.sql`（**不在** `supabase/config.toml` 的 seed 清單，`db reset` 不會自動執行；也不是 migration）。
- **不匯入 G8 球員名單**（球員資料需要本人同意）。G6 只用來確認 `tfpl` 賽事，歷史戰績不匯入。

## 重新產生 SQL

```bash
node scripts/import-futuro-data.mjs           # 改了 CSV 或腳本之後
node scripts/import-futuro-data.mjs --check   # 確認 commit 的 SQL 和 CSV 一致
```

輸出最後會列出 `note:`（已自動處理的資料問題）和 `UNMAPPED:`（無法對應、被略過或留空的列）。目前的輸出：

```
venues 9, clubs 8, fixtures 21, standings 16
completed 2, with replay 2
note: G2 太原足球場: capacity "400 | 20000" is not a single number; left empty
note: G2 楠梓足球場: capacity "1200（另臨時席3000）" is not a single number; left empty
note: G2 輔仁大學足球場: capacity "5000 | 3000" is not a single number; left empty
note: G2 汐止綜合運動場: capacity "600 | 466" is not a single number; left empty
note: G1 台中FUTURO: home venue free text "台中西屯足球場（另有主場賽事排在太原足球場、南屯人工草皮練習場）" -> 台中西屯足球場
note: G1 大同石虎: home venue free text "輔仁大學足球場／臺北田徑場（多場地）" -> 輔仁大學足球場
note: G4: round(s) 1 marked unofficial (is_official = false)
note: G6: 2026/27 TFPL = existing competition 'tfpl' (seeded by migration); 11 history rows not imported
no unmapped rows
```

## 腳本怎麼處理已知的資料問題

| 問題 | 處理 |
|---|---|
| 場地名稱不一致（`西屯足球場`＝`台中西屯足球場`、`台北田徑場`＝`臺北田徑場`） | 比對前把「臺」換成「台」並去掉空白，另有別名表 `VENUE_ALIASES` |
| 容量不是單一數字（`400 \| 20000`、`1200（另臨時席3000）`） | 只收純數字，其他留空並列在 note |
| G1 的主場是自由文字 | 取文字中第一個出現的已知場地；找不到就留空並列在 UNMAPPED |
| G5 沒有場次編號 | 依日期對應比賽，並確認影片標題含對手隊名、輪次一致，否則不連結 |
| G4 第 1 輪是自行計算 | notes 含「非官方」或「自行計算」時 `is_official = false` |
| 賽季寫法不一（`2026/27`、`2026-27`、`2026/2027`） | 一律正規化成 `2026/27`；不是 2026/27 台企甲的列略過 |
| 沒有 ASCII 代號 | 腳本內 `CLUBS`、`VENUES` 對照表給 slug |

隊名縮寫 `abbr`（官網沒有隊徽授權時用的圓章）：`SAC` 取自 CTFA 簡稱，`HYFC`、`TSG`、`TCR` 取自 CTFA 隊徽檔名，`FUT`、`TPC`、`KAFC`、`TTFC` 是暫定，**請球團確認**。

## 匯入了什麼

- `public_venues` 9 筆、`clubs` 8 筆（`台中FUTURO` 為 `is_self`；`crest_permission` 新增時是 `unknown`，之後不會被覆蓋；不填隊徽路徑）。
- 一線隊（`台中FUTURO 一線隊`）21 場台企甲：`training_sessions`（`kind = league`、台北時間開球、`ends_at = 開球 + 150 分`、`location` 填場地名稱、**不設 `venue_id`**）＋ `match_publications`（對手文字與 `opponent_club_id`、主客場、`public_venue_id`、賽季、賽事 `tfpl`、輪次）。
  - 全部 **`is_published = false`**，要 admin 檢查後再公開。
  - 已結束的 2 場：比分、`completed`、`result_entered_at`（設為開球 + 150 分）、CTFA TV 重播影片 ID。
- `standings` 16 筆（第 1 輪後非官方、第 2 輪後官方）；`source_url`、`fetched_at` 取自 CSV。

## 重複執行

SQL 是冪等的，整份包在一個 transaction：

- 場地、隊伍依 `slug` upsert（CSV 有值時以 CSV 為準；CSV 空白時保留 admin 填的值）；積分榜依（賽季、賽事、輪次、隊伍）upsert。內容沒變的列不會被更新（`updated_at` 不變）。
- 比賽先找「同賽季＋同賽事＋同輪次」，再找「一線隊＋同開球時間」。找到就**只補空白欄位**（對手隊伍、場地、賽季、賽事、輪次；還是 `scheduled` 時補比分；沒有重播時補重播），不會覆蓋 admin 改過的內容，也不會改開球時間。找不到才新增。
- 執行時會顯示 `NOTICE: futuro fixtures: N created, M filled in`。第二次執行應該是 `0 created, 0 filled in`。

## 套用到 staging

前提：staging 已套用 `20261009110000_site_public_api_v1.sql`（有一線隊、賽季 `2026/27`、賽事 `tfpl`）。缺任何一個，SQL 會直接報錯，不會寫入。

1. Supabase Dashboard（**staging 專案**）→ SQL Editor → New query。
2. 貼上 `supabase/seeds/futuro_2026_27.sql` 全文 → Run。
3. 確認結果訊息有 `futuro fixtures: 21 created, 0 filled in`（第一次）。
4. 再執行一次，應該是 `0 created, 0 filled in`。

## 套用後要檢查

在 SQL Editor：

```sql
select count(*) from public.clubs;            -- 8
select count(*) from public.public_venues;    -- 9
select after_round, count(*), bool_and(is_official) from public.standings group by 1 order by 1;  -- 1|8|f, 2|8|t
select p.round_no, s.starts_at at time zone 'Asia/Taipei', p.side, p.opponent, p.public_status,
       p.club_score, p.opponent_score, p.replay_video_id, s.venue_id
from public.match_publications p join public.training_sessions s on s.id = p.session_id
where p.season_id = (select id from public.seasons where label = '2026/27')
order by p.round_no;                          -- 21 列，venue_id 全部是 null
```

接著在 Squadbase 後台：

1. 比賽列表會多 21 場一線隊比賽（未公開）。逐場打開，確認開球時間、對手、主客場、「官網賽程資訊」區塊的對手、場地、輪次。
2. 第 1、2 輪在「直播與影片」按一次儲存，讓系統用 YouTube 檢查嵌入狀態（匯入時是「無法確認」）。
3. 確認沒問題後再公開。公開後官網的 `site_list_matches()` 才看得到；`site_get_standings()` 會回傳第 2 輪後的 8 隊。

本機測試（`npx supabase db reset` 之後）：`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seeds/futuro_2026_27.sql` 執行兩次；暫時把這 21 場設為公開後，以 anon 執行 `site_list_matches()` 為 21 場、`site_get_standings()` 為 8 隊。
