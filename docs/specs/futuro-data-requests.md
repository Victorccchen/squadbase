# 台中 FUTURO 官網：資料蒐集任務（交給 Grok-Bot）

> 版本：v1｜2026-10-03（台北時間）
> 配套文件：[`futuro-site-architecture-v3.md`](futuro-site-architecture-v3.md) 第 14 節
> 這份文件可以單獨交給 Grok-Bot，不需要其他背景。

---

## 背景

我們正在幫「台中FUTURO」（台中 Futuro FC）製作球團官網。台中FUTURO 是「臺灣企業甲級足球聯賽」（台企甲，英文 Taiwan Football Premier League，TFPL）的球隊，聯賽由中華民國足球協會（CTFA）主辦。2026/27 球季共 8 隊，每隊 21 場。

官網需要一些網路上查得到的公開資料。請依下面的任務清單蒐集，並依指定格式交回。

---

## 共同規則（每個任務都適用）

1. **每一筆資料都要附來源網址**（`source_url`）和查詢日期（`retrieved_at`，格式 `YYYY-MM-DD`）。沒有來源的資料不要交。
2. **不要猜。** 查不到就填空白，並在 `notes` 寫「查無資料」。不要用推測或模型記憶補上。
3. **來源優先順序**：CTFA 官網（ctfa.com.tw）→ 球隊官方網站或官方 SNS → 政府或場館官方網站 → 主流媒體 → 維基百科。維基百科只能當線索，最好再找一個原始來源。
4. **兩個來源不一致時**，兩個都列出來，在 `notes` 說明差異，不要自己選一個。
5. **每筆資料加信心欄位** `confidence`：`high`（官方來源）、`medium`（主流媒體或兩個以上非官方來源一致）、`low`（只有單一非官方來源）。
6. **隱私限制（必須遵守）**：
   - **不蒐集任何未成年人（未滿 18 歲）的資料**，包括姓名、照片、學校、背號。
   - 成年球員只蒐集公開登錄資訊：姓名、背號、位置、國籍。**不蒐集**生日、身分證件、聯絡方式、住址、家人資訊。
7. **圖片只給網址**，不要下載或重新上傳隊徽、照片。
8. 名稱的日文和英文寫法，**只採用官方寫法**（球隊官網、CTFA 英文頁、AFC 官網）。沒有官方寫法就留空，不要自行翻譯。
9. 交回的資料一律視為「待確認」，我們會人工核對後才使用。

---

## 交回格式

- 每個任務交一個 CSV 檔，檔名用任務代號，例如 `G1-clubs.csv`。編碼 UTF-8，第一列是欄位名稱。
- 另外交一份 `summary.md`：每個任務完成多少筆、查不到哪些、來源不一致的地方、你覺得需要人工特別確認的地方。
- 每個 CSV 的最後三欄固定是：`source_url`、`retrieved_at`、`confidence`，必要時再加 `notes`。一筆資料有多個來源時，`source_url` 用 ` | ` 分隔。

---

## 任務清單

### G1｜台企甲 2026/27 八隊資料 → `G1-clubs.csv`

| 欄位 | 說明 |
|---|---|
| `name_zh` | CTFA 上的正式中文隊名（例：台中FUTURO） |
| `name_en` | 官方英文隊名 |
| `name_ja` | 官方日文隊名（多數隊伍應該沒有，留空即可） |
| `short_zh` | 常用中文簡稱（例：台電） |
| `short_en` | 常用英文簡稱 |
| `crest_url` | 隊徽圖片網址（CTFA 或球隊官網上的原圖） |
| `home_venue` | 2026/27 登記的主場名稱 |
| `website_url`、`instagram_url`、`facebook_url`、`youtube_url` | 官方帳號，沒有就留空 |
| `notes` | 例如曾經改名、企業名稱 |

起點：CTFA 2026/27 台企甲頁面 https://www.ctfa.com.tw/2026-a

已知的 2026/27 隊伍（請核對）：台中FUTURO、台灣電力、高雄先鋒、大同石虎、陽信北競、新北航源、南市台鋼、台中磐石。

### G2｜台企甲各隊主場的場地資料 → `G2-venues.csv`

涵蓋 G1 每一隊的主場，以及 2026/27 賽程中出現的所有場地。已知包含：台中西屯足球場、太原足球場（台中市北屯區）、楠梓足球場（高雄）。

| 欄位 | 說明 |
|---|---|
| `name_zh`、`name_en` | 場地名稱 |
| `address_zh`、`address_en` | 地址 |
| `lat`、`lng` | 座標（小數點後 5 位） |
| `google_maps_url` | Google 地圖連結 |
| `transit_zh` | 大眾運輸：公車路線與站名、捷運或火車站與步行時間 |
| `parking_zh` | 停車場位置、是否收費 |
| `accessibility_zh` | 無障礙設施（查不到就留空） |
| `capacity` | 觀眾席容量 |
| `surface` | 天然草或人工草 |
| `operator` | 管理單位（例：台中市政府運動局） |

### G3｜台中FUTURO 2026/27 全部賽程 → `G3-fixtures.csv`

| 欄位 | 說明 |
|---|---|
| `round` | 輪次（數字） |
| `date` | `YYYY-MM-DD` |
| `kickoff` | 開球時間 `HH:MM`（台北時間） |
| `home`、`away` | 主隊、客隊（用 G1 的 `name_zh`） |
| `venue` | 場地（用 G2 的 `name_zh`） |
| `status` | `scheduled`／`completed`／`postponed`／`cancelled` |
| `home_score`、`away_score` | 已結束的比賽才填 |
| `competition` | 固定填「台企甲 2026/27」 |

起點：https://www.ctfa.com.tw/2026-a/teamplan/67-tfpl2026/252-futuro.html

已知前幾場（請核對）：
- 第 1 輪 9/13 台中FUTURO 0:1 大同石虎（台中西屯足球場）
- 第 2 輪 9/20 台中FUTURO 0:2 高雄先鋒（台中西屯足球場）
- 10/11 15:30 台灣電力 vs 台中FUTURO（楠梓足球場）
- 10/18 16:00 台中FUTURO vs 陽信北競（太原足球場）
- 10/25 19:00 台中磐石 vs 台中FUTURO（台中西屯足球場）

### G4｜台企甲 2026/27 積分榜 → `G4-standings.csv`

每一輪結束後的完整 8 隊積分榜，有幾輪交幾輪。

| 欄位 | 說明 |
|---|---|
| `after_round` | 第幾輪後 |
| `position` | 名次 |
| `club` | 用 G1 的 `name_zh` |
| `played`、`won`、`drawn`、`lost`、`goals_for`、`goals_against`、`points` | |

起點：CTFA 2026/27 台企甲排名頁。

### G5｜台中FUTURO 2026/27 比賽的 CTFA TV 影片 → `G5-videos.csv`

CTFA 在 YouTube 頻道「CTFA TV」（https://www.youtube.com/@CTFATV）直播每一場台企甲比賽，直播結束後同一網址就是完整重播。

| 欄位 | 說明 |
|---|---|
| `round`、`date` | 對應 G3 |
| `video_url` | 單場直播或重播的網址（`youtube.com/watch?v=` 或 `youtube.com/live/` 格式），**不要給頻道或播放清單網址** |
| `video_title` | YouTube 上的影片標題（用來確認沒有配錯場次） |
| `type` | `live_replay`（完整直播重播）或 `highlights`（精華） |
| `duration` | 片長 |

已知（請核對）：第 1 輪 `BX5z_31ePNk`、第 2 輪 `2xp137k-j2c`。

### G6｜台中FUTURO 參加過的賽事 → `G6-competitions.csv`

列出台中FUTURO 一線隊參加過的所有正式賽事（每項賽事一列，每個賽季一列）。

| 欄位 | 說明 |
|---|---|
| `season` | 例：2023/24 |
| `name_zh`、`name_en` | 賽事名稱（例：台灣企業甲級足球聯賽、AFC Cup、AFC Challenge League） |
| `organizer` | 主辦單位（CTFA、AFC 等） |
| `kind` | `league`／`cup`／`continental` |
| `final_result` | 最終名次或成績（例：亞軍、小組賽出局、淘汰賽） |

### G7｜歷史與榮譽的來源 → `G7-history.csv`

下面每一條都找出可靠來源，並補上更精確的日期或數字。找到清單外的重要事件也請列出（`notes` 寫「新增」）。

| 欄位 | 說明 |
|---|---|
| `year` | |
| `event_zh` | 事件 |
| `detail` | 精確日期、比分、戰績等 |

待核實清單：
1. 2016 年由日籍前職業球員小森由貴創立
2. 2018 年成立成人隊，通過台企甲資格賽
3. 2019 年首季參加台企甲
4. 2020、2021 年台企甲季軍
5. 2022 年台企甲亞軍（10 勝 7 和 1 負）
6. 2023–24 年 AFC Cup，打進淘汰賽
7. 2025 年 3 月與 J 聯賽大分三神（Oita Trinita）簽合作備忘錄
8. 2025/26 台企甲第 4 名，參加 AFC Challenge League 資格賽
9. 2026 年 U16 健身工廠盃冠軍（**只記賽事名稱和成績，不要記任何球員姓名**）
10. 營運單位的正式名稱（有一個來源寫「臺中市足球未來發展協會」）

### G8｜一線隊 2026/27 公開登錄名單與教練團 → `G8-squad.csv`

**只限成年球員。** 如果無法確認某位球員已滿 18 歲，就不要列入。

| 欄位 | 說明 |
|---|---|
| `role` | `player` 或 `staff` |
| `number` | 背號（球員） |
| `name_zh`、`name_en`、`name_ja` | 只填官方來源上出現的寫法 |
| `position` | GK／DF／MF／FW（球員）；職稱（教練團，例：總教練） |
| `nationality` | 國籍 |
| `previous_club` | 前所屬球隊（官方或主流媒體有寫才填） |

起點：CTFA 2026/27 台企甲的球隊名單頁、台中FUTURO 官方 IG 和 FB 的名單公告。

> 這份名單只作為草稿，球團確認、球員簽署肖像同意書之後，才會公開。

### G9｜台中FUTURO 官方帳號與舊網站網址 → `G9-accounts.csv`、`G9-wix-urls.csv`

**`G9-accounts.csv`**：所有官方帳號。

| 欄位 | 說明 |
|---|---|
| `platform` | Instagram／Facebook／YouTube／LINE 官方帳號／X／Threads／其他 |
| `handle`、`url` | |
| `followers` | 追蹤人數（查詢當天） |
| `last_post_date` | 最近一次發文日期 |

已知：IG `@futuro.football`、FB `FUTURO.TAIWAN`。

**`G9-wix-urls.csv`**：台中FUTURO 現有官網（Wix 站）的所有頁面網址，用於日後轉址。

| 欄位 | 說明 |
|---|---|
| `url` | 頁面網址 |
| `title` | 頁面標題 |
| `content_summary` | 一句話說明這頁的內容 |

### G10｜台企甲規則 → `G10-rules.csv`

| 欄位 | 說明 |
|---|---|
| `topic` | `tiebreak`（同分排名規則）／`postponement`（延期的公告方式與時程）／`ticketing`（門票政策，是否收費、售票方式）／`broadcast`（CTFA TV 轉播規範，是否允許嵌入或轉載） |
| `rule_zh` | 規則內容摘要 |
| `document_url` | 原始規章或公告的網址（PDF 也可以） |

起點：CTFA 官網的台企甲競賽規程。

---

## 交回後我們會做的事

1. 人工逐筆核對 `confidence` 為 `medium`、`low` 的資料。
2. G1、G2、G3、G4、G5、G6 匯入官網資料庫，標記來源。
3. G7、G9 用於「球團」頁和轉址規劃。
4. G8 交給球團確認，並請球員簽署肖像同意書後才公開。
5. G10 用於積分榜說明、延期流程和觀賽須知。
