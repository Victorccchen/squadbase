# Claude v3 架構審查（對照 v2、對標研究、設計稿與 Squadbase main）

> 審查日期：2026-10-03（台北時間）｜更新：2026-10-03 17:20 加入 Victor 決定（§6）｜審查者：Grok（研究與架構端；不改 repo、不開 PR）
> 審查對象：`claude-v3/futuro-site-architecture-v3.md`（修訂版，含「官網另開新前台、共用 Supabase」決策，Victor 2026-10-03 核准）
> 對照：`futuro-site-architecture-v2.md`、`futuro-benchmark.md`、`/workspace/futuro-designs/`、Squadbase `main` @ `3a51e95`（2026-10-02 21:33 台北時間，唯讀查核）
> 產出：本文件是判定表；修正後的完整規格在 `futuro-site-architecture-v4.md`。
> 標記：✅ 正確／⚠️ 要補充細節／❌ 錯誤或會出問題

---

## 0. 結論

- v3 方向正確，比 v2 完整很多：四種主視覺、延期狀態、對手和場地資料表、同意紀錄、帳號歸屬，都值得採用。
- 但 v3 有 **5 個會直接造成錯誤的程式碼判斷**（第 2 節的 C1–C5），其中 2 個會讓 Squadbase 現有的報到和任務功能出錯。v4 已全部修正。
- 「官網另開前台」決策維持不變。v4 補上 3 個 v3 沒寫到的前提：**正式環境的 Supabase 目前還不存在**、**Squadbase PWA 的 `start_url` 是 `/`**、**Supabase 雲端預設會把新資料表和函式開放給 anon**。
- 第一階段範圍要再收斂：`partner_clicks` 不做；`media` 角色縮小範圍；每週內容從固定 4 則改成 2 則必做、2 則選做。

---

## 1. 逐節審查（v3 各節 → 判定）

| v3 章節 | 判定 | 說明（v4 怎麼處理） |
|---|---|---|
| 修改摘要 | ⚠️ | 內容正確，但「和程式碼對齊」那一列有 3 處和實際程式碼不符（見 C1、C3、C4）。v4 在最上方另加「v4 相對 v3 的調整」表 |
| 0 背景 | ⚠️ | Next.js 16 正確（實際 16.3.4）。少了兩點：Squadbase **只有 staging 的 Supabase**，migration 是手動貼到 SQL Editor 執行；公開頁面目前只有 4 個（首頁、登入、比賽列表、比賽頁），56 頁裡 52 頁在 `/[locale]/app` 底下，v3 的數字正確 |
| 系統架構 | ⚠️ | 決策方向正確。缺：正式環境 DB、公開 API 命名與版本、anon 預設權限、PWA `start_url`、網域與登入連結、快取失效的具體做法（Next 16 的 `revalidateTag` 要帶第二個參數）。v4 改寫成 12 條規則 |
| 1 設計原則 | ✅ | v4 加第 7 條「公開資料最小化」 |
| 2 主選單 | ✅ | v4 補「略過導覽」連結和頁尾的組織資料（JSON-LD） |
| 3 首頁＋3.1 四種狀態 | ⚠️ | 四種狀態採用。缺「比賽結束但還沒輸入比分」的畫面；優先順序 B→C→A→D 正確 |
| 4 網站地圖 | ✅ | 場地頁第一階段做成觀賽頁裡的錨點，同意 |
| 5.1 影片欄位 | ⚠️ | 放在 `match_publications` 正確。缺「輸入比分的時間」欄位：5.2 的規則要用到它，但現有資料表只有 `updated_at`（見 C6） |
| 5.2 狀態判斷 | ❌ | 「`liveEnd = ends_at`」的前提是一線隊比賽的 `ends_at` 是開球後 150 分鐘，但現有程式碼的預設是 **90 分鐘**（見 C3）。v4 改成 `scheduledEnd = max(ends_at, kickoff + 150)` |
| 5.3 顯示與備援 | ⚠️ | 補 post_match 沒有比分時的顯示；cancelled 要配合 C2 的修改才看得到 |
| 5.4 網址驗證 | ✅ | 沿用 v2 |
| 5.5 `<MatchVideo>` | ✅ | v4 補：點擊才載入的播放鈕記錄成分析事件，作為「播放次數」的近似值 |
| 5.6 後台與 media 角色 | ⚠️ | 新增 enum 值要放在獨立的 migration（Squadbase 加 `director` 時就是這樣做）；約 10 支 `admin_*` 比賽 RPC 和 RLS 都要改；名單編輯要讀 `players`，會碰到生日等個資。v4 縮小 media 的範圍，不含名單 |
| 5.7 風險 | ✅ | v4 加：預設 90 分鐘、Google 日曆更新慢、LINE 預覽圖快取 |
| 6.1 比賽頁 | ⚠️ | `.ics`、分享圖、JSON-LD 採用。補 `eventStatus` 對應、UID 規則、分享圖快取破除 |
| 6.2 一線隊 | ⚠️ | 現有 `players.photo_path` 是**報名用的大頭照**，放在私有 bucket，旁邊就是 `id_pdf_path`（證件）。官網照片必須另開欄位、放公開 bucket，不能共用 |
| 6.3 新聞 | ✅ | 四種範本、攝影者署名採用 |
| 6.4 觀賽 | ⚠️ | 場地資料表要改名，見 C4 |
| 6.5 青訓 | ✅ | |
| 6.6 球團 | ✅ | |
| 6.7 夥伴 | ⚠️ | 點擊紀錄要開放 anon 寫入，濫用風險高、維護成本也高。v4 改用 UTM 加分析工具事件，不建資料表 |
| 6.9 媒體專區 | ⚠️ | 第一階段只放媒體窗口和新聞稿；隊徽下載等球團核准隊徽後再開 |
| 7.1–7.2 | ✅ | |
| 7.3 每週流程 | ⚠️ | 每週固定 4 則對小團隊太重。v4 改成 2 則必做（比分、短戰報）、2 則選做 |
| 8.1 程式碼要改的地方 | ❌ | 漏了 90 天限制（C1）、`admin_cancel_match` 會取消公開（C2）、預設 90 分鐘（C3）；`venues` 已經存在（C4）；預備隊的年齡規則其實已有預設（C5） |
| 8.2 新資料 | ⚠️ | `clubs`、賽季、賽事、積分榜採用；`venues` 不能用這個名字（C4）；輪次要加數字欄位才能排序；同意紀錄建議第一階段不上傳掃描檔 |
| 8.3 支援對照 | ⚠️ | 依上面各點更新 |
| 9 驗證事項 | ✅ | v4 加負責人；10/11 的直播嵌入實測可以由研究端用 box 上的獨立測試頁做，不用動 repo |
| 10 分階段 | ⚠️ | 第 0 階段缺「建立正式環境 Supabase」和「公開 API 合約 v1 加 anon 權限稽核」；第 1 階段太大，v4 拆成 1a（上線必備）和 1b（上線後 4 週內） |
| 11 上線與營運 | ⚠️ | Vercel Hobby 方案不能商用，官網有贊助商，要用 Pro；只有 `wixsite.com` 子網域的話沒辦法做 301 轉址；翻譯不齊的頁面要用 canonical 指回繁中 |
| 12 待決事項 | ✅ | v4 另列「要 Victor 決定的事」 |
| 13 待展開問題 | ⚠️ | v4 更新 13-A／B／C，加入本審查發現的項目 |
| 14 資料蒐集 | ✅ | 不變，指向 `futuro-data-requests.md` |

---

## 2. 程式碼判斷查核（對照 `main` @ 3a51e95）

| # | v3 的說法 | 實際程式碼 | 判定 | v4 的修正 |
|---|---|---|---|---|
| — | Next.js 16（App Router） | `package.json`：`next 16.3.4`、`react 19.2.8`、`next-intl ^4.8.2`、Tailwind 4；middleware 已改名為 `proxy.ts`；`AGENTS.md` 要求先讀 `node_modules/next/dist/docs/` | ✅ | 官網寫明 16.3.x |
| — | Squadbase 56 頁中 52 頁是登入後的後台 | `app/**/page.tsx` 共 56 個，其中 52 個在 `[locale]/app/` 底下；公開頁只有 `/[locale]`、`/login`、`/matches`、`/matches/[id]` | ✅ | — |
| — | 匿名 RPC `list_published_matches` 存在 | `20260907120000_stage5b_public_matches.sql:172`；只 grant 給 anon 和 authenticated 的 RPC 只有 3 支：`list_published_matches`、`get_published_match`、`list_published_match_roster` | ✅ | — |
| — | `list_published_matches` 沒有回傳 `age_band` | 實際回傳：`id, team_id, team_name, title, kind, is_playoff, starts_at, ends_at, location, opponent, side, public_status, club_score, opponent_score, result_note`，確實沒有 `age_band` | ✅ | 新的 `site_*` RPC 回傳 `age_band` 和 `team_kind` |
| **C1** | （v3 沒提）賽程頁可以顯示整季 | 同一檔 `:215`：`and s.starts_at >= (now() - interval '90 days')`，**超過 90 天的比賽不會回傳**。9 月的第 1 輪到 12 月中就會從賽程和結果裡消失 | ❌ 漏掉 | 新增 `site_list_matches(p_season_id, …)`，依賽季回傳整季；舊 RPC 不動 |
| **C2** | 可見條件加上 `cancelled`，「仍需 `is_published = true`」，取消的比賽就能公開顯示 | `admin_cancel_match`（同一檔 `:720–730`）會把 `is_published` 設成 **false**，同時清空比分；`admin_restore_match` 也會設成 false（`:757`）。只改可見條件的話，取消的比賽**還是看不到** | ❌ | `admin_cancel_match` 改成保留 `is_published`；新增 `admin_postpone_match`；還原時也保留公開狀態 |
| — | `match_is_publicly_visible` 只放行 `scheduled`、`completed` | `20260909010000_stage6p1_friendly_matches.sql:24–42`：`public_status in ('scheduled','completed')`，類型包含 cup／league／friendly | ✅ | 新函式 `site_match_is_visible` 放行 4 種狀態，舊函式不動 |
| — | 友誼賽也會公開 | 同上，`is_match_session_kind` 包含 `friendly` | ✅ | 官網預設只顯示 league 和 cup，友誼賽放在篩選裡 |
| — | 新增 `postponed` | `match_public_status` 目前只有 `scheduled／completed／cancelled`；有 check constraint 要求非 completed 時比分為 null，`postponed` 符合 | ⚠️ | `ALTER TYPE … ADD VALUE` 要放在**獨立的 migration**，下一支才能使用（Squadbase 加 `director` 時就是這樣：`20261006100000_director_role.sql`） |
| **C3** | 「`ends_at` 已存在而且必填，直播結束時間直接用它」 | `ends_at` 確實必填（`training_sessions`），但 `lib/org/match.ts:26` 的 `DEFAULT_MATCH_DURATION_MINUTES = 90`，建立和匯入比賽時的預設是開球後 **90 分鐘**。直接用 `ends_at` 的話，直播播放器會在下半場傷停時就切掉 | ❌ 要補充 | 狀態判斷改用 `scheduledEnd = max(ends_at, kickoff + 150 分)`；一線隊建立和匯入時預設 150 分；回填已建立的一線隊比賽 |
| — | 輸入比分後再保留 `postMatchGraceMin` | `match_publications` 只有 `updated_at` 和 `published_at`，**沒有記錄輸入比分的時間**；`updated_at` 在改任何欄位時都會變 | ⚠️（C6） | 新增 `result_entered_at`，由 `admin_set_match_result` 寫入 |
| **C4** | 新增場地表 `venues`，比賽新增 `venue_id` | `public.venues` **已經存在**（`20261004100000_venue_checkin_headcount.sql:32`，PR-07），有秘密欄位 `checkin_token`（QR 報到用，只有 admin 能讀）；`training_sessions.venue_id` **也已經存在**（`:67`）。只要 session 有 `venue_id`：(1) 開球前 30 分鐘到結束，家長可以掃 QR 報到（`checkin_open_sessions`，`:498`）；(2) 結束 1 小時後沒填人數，系統會開「缺少人數」任務給 admin（`:915–930`）。照 v3 寫 `create table if not exists venues` 會**無聲跳過**，在比賽上設 `venue_id` 則會**每場一線隊比賽都產生假任務** | ❌ | 另開 `public_venues`（只放公開欄位），比賽用 `match_publications.public_venue_id`；**不要**在一線隊比賽設 `training_sessions.venue_id` |
| **C5** | 預備隊若有未成年球員，個別排除（待確認） | `default_eligible_birth_ages('reserve') = {senior}`（`20260918010000…:24`），預備隊預設只收成年球員；但這個值可以個別覆寫，歷史名單也不會清掉 | ⚠️ | 名單 RPC 除了看隊伍的 `age_band`，**每位球員再用比賽日的實際年齡過濾（未滿 18 歲不回傳）**，雙重保險 |
| — | 公開名單只限一線隊 | `list_published_match_roster` 目前對任何已公開的比賽都回傳姓名和背號，包括 U8–U12 的比賽 | ✅（現在就是隱私缺口） | **不論官網進度，都建議 Claude Code 優先修**：只對 senior／reserve 回傳，加上年齡過濾 |
| — | 一線隊可以用 `teams.age_band = senior` 表示 | enum 有 `senior`、`reserve`；但比賽要掛在 `competition_team`（隊伍），目前種子資料只有 U8–U12 的隊伍，**還沒有一線隊的隊伍** | ⚠️ | 第 0 階段建立「台中FUTURO 一線隊」（`competition_team`、`layer_key = senior`）。官網用 `firstTeamId` 設定明確指定，不只靠 `age_band` 判斷 |
| — | 一線隊球員放在 `players` | `players.birth_date NOT NULL`，報名用的大頭照在私有 bucket `player-photos`（`photo_path`、`id_pdf_path`） | ⚠️ | 一線隊球員也要有生日（不公開）；官網照片另開 `public_photo_path`，放公開 bucket |
| — | `unstable_cache` 沒有 tag，只靠 60 秒到期 | `lib/site/portal-match-query.ts:36`，`revalidate: 60`，沒有 tag；而且 RPC 出錯時會 `return []`（`:31`），**空結果也會被快取 60 秒**，Supabase 短暫出錯時首頁會顯示「沒有比賽」 | ✅＋補充 | 官網出錯時拋出例外，不快取空結果，沿用上一份正常的資料 |
| — | 用 `revalidateTag` 讓快取失效 | Next 16：`revalidateTag(tag)` 只帶一個參數的寫法已經廢棄，要寫成 `revalidateTag(tag, 'max')`；外部服務呼叫 Route Handler 要立即失效時用 `revalidateTag(tag, { expire: 0 })`；`updateTag` 只能在 Server Action 裡用。tag 要透過 `'use cache'` 加 `cacheTag()`，或 `fetch` 的 `next.tags` 指定 | ⚠️ | 13-C2 寫明 |
| — | 角色：admin，提議新增 media | `app_role`：`parent, coach, admin, player, director`；`has_role()` 查 `user_roles`，一個人可以有多個角色；約 10 支 `admin_*` 比賽 RPC 和 `match_publications` 的 RLS 都寫死 `has_role('admin')` | ⚠️ | media 的範圍：影片欄位、比分、延期、新聞、積分榜；不含名單（名單要讀 `players` 個資）。enum 值放在獨立的 migration |
| — | 官網只用 anon key，碰不到後台 | 目前 org 資料表都有明確 `revoke all … from public, anon`。但 `supabase/config.toml` 註明雲端預設 `auto_expose_new_tables = true`，Postgres 新函式預設也開放 EXECUTE 給 PUBLIC。**只要有一支新的資料表或函式忘了 revoke，anon key 就讀得到**。anon key 本來就在 Squadbase 前端公開（`NEXT_PUBLIC_SUPABASE_ANON_KEY`），多一個前台不會多暴露金鑰，但會多一批新的公開 RPC | ⚠️ | 每支新 migration 都要 revoke 和明確 grant；新增 `site_anon_surface_verification.sql`，列出所有 anon 可以執行的函式和讀取的資料表，結果必須等於白名單 |
| — | 型別用 Supabase CLI 從資料庫產生 | Squadbase 的 migration 是手動貼到 SQL Editor 執行，staging 和 repo 曾經不一致（#52 baseline 問題） | ⚠️ | 從 DB 產生型別是對的（能反映真實狀態），但要用 staging 和正式環境分別產生並比對；官網只使用包裝過的 `PublicApi` 型別 |
| — | 正式環境 | README 和每支 migration 都寫「staging only，不要在 production 執行」；**目前沒有正式環境的 Supabase** | ❌ 漏掉 | 第 0 階段要決定：建立正式環境 Supabase，套用全部 migration（先解決 #52）。官網正式版不可以接 staging |
| — | 現有公開首頁轉址到官網 | `app/manifest.ts:8`：PWA 的 `start_url: "/"`，會先轉到 `/zh-Hant`，也就是 portal 首頁。直接把 `/[locale]` 轉到官網的話，**家長從手機桌面打開 PWA 會跑到官網** | ❌ 漏掉 | 先把 `start_url` 改成 `/zh-Hant/app`；`/[locale]` 只在未登入時轉到官網，已登入的轉到 `/app`；`/[locale]/matches/[id]` 用同一個 id 轉到官網的比賽頁 |
| — | 家長登入連結 | 登入是手機 OTP（`/[locale]/login`）；portal 依登入狀態顯示「App」或「登入」 | ⚠️ | 官網在不同網域，讀不到登入狀態，一律連到 `https://<Squadbase 網域>/{locale}/login`；登入頁要讓已登入的人直接轉到 `/app` |
| — | next-intl 三語 | `localePrefix: "always"`、`localeDetection: false`、預設 zh-Hant | ✅ | 官網沿用相同規則，轉址時的網址比較好對應 |
| — | CORS | Supabase REST 本來就接受任何來源的 anon 請求；revalidate 是伺服器對伺服器的呼叫 | ✅（不需要設定） | 官網只在伺服器端呼叫 Supabase，瀏覽器不直接連 Supabase |

---

## 3. 「另開前台」決策：風險與建議（維持決策，只做補強）

| 面向 | 風險 | 建議（已寫進 v4「系統架構」） |
|---|---|---|
| 正式環境 | 官網上線就需要正式環境的 DB，但 Squadbase 還沒有 | 第 0 階段建立正式環境 Supabase 並套用全部 migration（先修好 #52）；官網 preview 接 staging，production 接正式環境。**Victor 已同意（§6-1）** |
| Schema 耦合 | 官網依賴 Squadbase 的資料表結構，後台一改官網就壞 | 官網**只呼叫 `site_*` 開頭的 RPC**，不直接讀任何資料表；`site_api_version()` 回傳合約版本；改動只能新增欄位 |
| migration 歸屬 | 兩個 repo 都想改 DB | 所有 migration 只放在 Squadbase repo（同 v3）。官網需要的新資料表也由 Claude Code 在 Squadbase 開 PR，PR 說明標註「影響官網」 |
| 公開 API 範圍 | 新 RPC 忘了 revoke，anon 就讀得到 | 白名單加稽核 SQL；RPC 只回傳明確列出的欄位，不用 `select *`；名單和人員資料在 SQL 層過濾未成年和未同意的人 |
| anon key | 前端 bundle 會暴露金鑰 | 官網只在伺服器端取資料，環境變數不用 `NEXT_PUBLIC_` 開頭，金鑰不會進到瀏覽器。安全仍然靠 grant 和 RLS，不靠金鑰保密 |
| 寫入 | 夥伴點擊需要 anon 寫入 | 第一階段官網**完全唯讀**，不建 `partner_clicks`，改用 UTM 加分析工具事件 |
| 快取與 ISR | 存檔後官網不會立刻更新 | 時間到期當作保底（比賽 60 秒，其他 1 小時）；Squadbase 存檔成功後，非同步呼叫官網 `/api/revalidate`（2 秒逾時，失敗也不影響存檔）；比分和直播相關的 tag 用 `{ expire: 0 }`；首頁狀態由用戶端計時切換 |
| 快取錯誤結果 | 出錯時快取了空資料 | 出錯就拋出例外，沿用上一份正常的快取 |
| i18n 重複 | 兩邊各有一份 messages | 官網的介面文字自己管；共用名詞（狀態、位置、輪次）在官網 repo 放一份三語詞彙表；隊名、場地名的三語寫法以 DB 為準。**不做共用套件或 monorepo** |
| 品牌設定 | 兩邊各有一份 | 以官網為準（同 v3）；Squadbase 只留 PWA 圖示和後台需要的部分 |
| 網域 | Squadbase 換網域會讓 PWA 安裝和推播訂閱失效（兩者都綁定來源網域） | 官網用球團的主網域；Squadbase **先留在現在的網域**（Victor 已決定，等業主確認啟動後再評估）。要換到 `app.<網域>` 的話另外規劃（重新安裝、重新訂閱推播、改 Supabase Auth 的轉址白名單） |
| 登入與 session | 兩邊共用 cookie 可能造成混淆 | 網域分開，cookie 自然分開；官網沒有登入功能。家長入口一律連到 Squadbase 的 `/{locale}/login` |
| 舊公開頁 | PWA 的 `start_url` 會被轉到官網 | 見第 2 節最後兩列 |
| 型別漂移 | staging 和正式環境的 schema 不一致 | 官網 CI 每晚用 staging 產生型別並跑 `tsc`；上線前再用正式環境比對一次 |
| 圖片 | 公開 bucket 被亂寫或被列出全部檔案 | 另開 `site-public` bucket：公開讀取，只有 admin 和 media 能寫入，不開放列出檔案；路徑規則固定；next/image 的 `remotePatterns` 只放這個 bucket |
| 費用與歸屬 | Vercel Hobby 不能商用；DB 在 Squadbase 名下 | 官網的 Vercel 用 Pro，先開在 Victor 名下、費用含在報價中；共用 DB 的資料歸屬和移交原則先寫進合約，實際移交日後再處理。**Victor 已決定（§6-5、§6-6）** |

---

## 4. v3 新增項目判定（小團隊、MVP 角度）

| 項目 | 判定 | 一句話理由 |
|---|---|---|
| 主視覺四種狀態 | **採用（調整）** | 成本低、價值高；補「比賽結束但還沒輸入比分」的畫面（顯示「賽果整理中」加重播） |
| 賽後主視覺 36 小時 | **採用** | 週日晚上的比賽可以撐到週二早上，剛好涵蓋戰報發布 |
| 休賽期主視覺 | **採用** | 台企甲 6–8 月約 3 個月沒有比賽，沒有這個畫面首頁會空掉 |
| 行事曆訂閱 `.ics` | **採用（調整）** | 只做一線隊整季一個訂閱，加單場下載；Google 日曆更新訂閱可能要 12–24 小時，延期時要另外用新聞和 SNS 公告 |
| LINE 分享 | **採用** | 只是一個分享網址，不用 SDK，台灣使用率最高 |
| 每場自動分享圖 | **採用（調整）** | 一種版型；網址帶 `?v=updated_at` 避免 LINE 和 FB 快取舊圖；沒有隊徽使用許可時用縮寫圓章；中文字型只載入用到的子集 |
| media 角色 | **延到第二階段**（Victor 決定先由 admin 兼任） | 範圍縮小到影片、比分、延期、新聞、積分榜，不含名單；第一階段由 admin 兼任 |
| 每週內容流程 | **採用（調整）** | 改成 2 則必做（比分、三句話戰報）加 2 則選做（賽前預告、積分榜）；積分榜草稿可以由研究端每輪整理 |
| 流量分析 | **採用（調整）** | 用不需要 cookie 同意視窗的工具；Vercel Analytics 的自訂事件要 Pro 方案；「直播觀看人次」量不到（觀看數算在 CTFA），改報「播放鈕點擊次數」 |
| 媒體專區 | **採用（縮小）** | 第一階段只放媒體窗口和新聞稿；隊徽下載等球團核准隊徽後再開 |
| 舊 Wix 站轉址 | **有條件採用** | 只有 Wix 綁了自訂網域才能做 301；如果只有 `futurofootball.wixsite.com`，就改成在 Wix 首頁放公告連結、更新各 SNS 的連結，之後再下架 |
| 翻譯不齊的處理 | **採用（調整）** | 介面文字一律翻譯；內容沒有翻譯時，canonical 指回繁中頁，不宣告 hreflang，也不列入該語言的 sitemap |
| 帳號歸屬 | **採用（補充）** | 加上 GitHub organization、網域註冊商、DNS、Search Console、YouTube、分析工具，全部用球團名義開，並開兩步驟驗證 |
| `clubs`（對手隊伍） | **採用（調整）** | 積分榜和對戰卡都需要；加 `abbr`（縮寫圓章用）和 `crest_permission` |
| `venues`（場地） | **採用（改名）** | 已有同名資料表（QR 報到用），改名為 `public_venues`；**不要**在比賽上設 `training_sessions.venue_id` |
| `seasons`／`competitions` | **採用（簡化）** | 也是解決 90 天限制的必要條件；欄位最少即可 |
| 輪次 | **採用（調整）** | 不另開資料表；`round_no int`（排序和「第 N 輪後」用）加 `round_label text` |
| 肖像同意紀錄 | **採用（調整）** | 第一階段只記錄同意範圍、時間、登記人、撤回時間；同意書正本由球團保管，不上傳掃描檔，減少系統裡的個資 |
| `standings`（積分榜） | **採用** | 人工輸入或匯入 CSV；附來源和更新時間 |
| 新聞、夥伴 | **採用** | 最小 schema |
| `partner_clicks` | **不做** | 需要開放 anon 寫入，有濫用風險；改用 UTM 加分析事件 |
| 第 0 階段 | **採用（補充）** | 加：建立正式環境 Supabase、公開 API 合約 v1、anon 權限稽核、修好現有名單的隱私缺口、建立一線隊隊伍、選定設計 |
| 其他（v3 第 1 階段全部項目） | **拆成 1a／1b** | 1a 是上線必備（首頁、比賽、一線隊名單、觀賽、球團概要、青訓入口、基本 SEO）；個人頁、新聞範本、媒體專區、夥伴頁、`.ics` 放 1b（上線後 4 週內） |

---

## 5. Claude 沒有寫到的研究、品牌和 UX 優化（v4 已加入）

| 類別 | 優化 | 依據 |
|---|---|---|
| SEO／結構化資料 | 首頁放 `SportsTeam`（`sport: Soccer`、`memberOf` 台企甲、`sameAs` 放 IG、FB、YouTube、CTFA 隊伍頁、維基百科中日英）；比賽頁放 `SportsEvent`（`homeTeam`／`awayTeam`、`eventStatus` 對應 `EventScheduled`／`EventPostponed`／`EventCancelled`／`EventRescheduled`、`eventAttendanceMode: Mixed`、`location` 放場地和地址、`organizer` 放 CTFA）；有重播時加 `VideoObject`（`embedUrl`、`thumbnailUrl`、`uploadDate`）；新聞放 `NewsArticle`；全站加 `BreadcrumbList` 和 `Organization` | Google 不保證運動賽事會出現 rich result，但有助搜尋引擎和 AI 摘要認得這個實體；CTFA 沒有公開名單，官網有機會成為 Futuro 資訊最完整的地方（對標研究 TL;DR 第 8 點） |
| OG | 每種頁面都有預設 OG 圖；`og:locale` 填 zh_TW、ja_JP、en_US；加 Twitter／X card；分享圖網址帶版本號 | LINE 會長時間快取預覽圖 |
| hreflang | 加 `x-default`（指向 zh-Hant）；`<html lang>` 用 `zh-Hant-TW`、`ja`、`en`；日文名字加 `lang="ja"` | |
| 無障礙 | WCAG 2.2 AA。**金色 #D4AB0A 在白底的對比只有 2.18:1，不能當文字色**（在海軍藍底上是 5.69:1，可以）；**紅色 #B81C22 在海軍藍底上只有 1.91:1**，LIVE 標示要用白字紅底（6.51:1）；倒數計時不能用 `aria-live` 逐秒播報；支援 `prefers-reduced-motion`；勝和負除了顏色也要有文字（W／D／L 或「勝／和／負」）；積分榜用真正的 `<table>` 加 `th scope` | 實際計算品牌色的對比 |
| 效能 | 中文和日文不載入完整的網路字型，優先用系統字型（PingFang、Noto CJK），Jost 只用在拉丁字母和數字（比分、倒數）；YouTube 一律點擊才載入（省下約 1 MB 的 JS）；倒數做成很小的用戶端元件；首頁 LCP 是文字主視覺（設計 A），不依賴照片 | 對標研究：台灣觀眾多半在球場用手機查詢 |
| 品牌與照片規範 | 比例：主視覺 16:9（手機 4:5）、球員卡 4:5、新聞縮圖 3:2；最短邊至少 1600px；每張照片都要有 alt 文字和攝影者署名；**可以辨識臉部的未成年人不能放在主視覺**（C 版那張整隊照有牽手童，要換）；配色比例海軍藍 60％、白或米白 30％、紅 8％、金 2％；比分和倒數用 Jost；語氣照實寫（「0:1 敗」，不粉飾） | 設計稿和對標研究 4.1 |
| 沒有照片時 | 對手隊徽沒有許可時用縮寫圓章；球員沒有照片時用剪影加背號大字；主視覺用排版設計（設計 A 的做法） | 設計稿 |
| 觀賽 | 加「第一次來看球」短指南（怎麼去、要不要買票、可以帶什麼、親子、輪椅）；日文版的時間標「（台湾時間）」 | J 聯賽的做法（對標研究 3.2） |
| 安全標頭 | HSTS、`X-Content-Type-Options`、CSP 加 `frame-ancestors 'none'`（官網本身不讓別人嵌入）；`Referrer-Policy: strict-origin-when-cross-origin`（YouTube 嵌入需要 Referer） | |
| 個資 | 第一階段不做聯絡表單（只放 mailto 和 LINE），系統不收集訪客個資；隱私權政策依個資法撰寫 | 減少營運負擔 |
| preview 環境 | Vercel preview 網址要確認是 noindex；sitemap 只在正式網域產生 | |
| 監控 | 官網記錄 RPC 錯誤；第二階段加外部的上線監控 | |

---

## 6. Victor 的決定（2026-10-03 回覆）

| # | 事項 | 決定 | 後續動作 | 狀態 |
|---|---|---|---|---|
| 1 | 正式環境 Supabase | **同意**：現在就建立正式環境，套用全部 migration（先修好 #52）；官網正式版只接正式環境，preview 接 staging | Claude Code 執行：先完成 #52 staging 修復與驗證，再建立正式環境並套用 migration | ✅ 已決定，待執行 |
| 2 | 現有公開名單的隱私缺口（`list_published_match_roster` 回傳 U8–U12 姓名與背號） | **同意**：請 Claude Code 先單獨修掉，不等官網 | Claude Code 執行：公開名單只回傳一線隊、比賽當天滿 18 歲的球員（規格見 v4 §8.1） | ✅ 已決定，待執行 |
| 3 | Squadbase 的網域 | **先維持現在的網域**；等業主確認啟動後再評估是否換到 `app.<球團網域>` | 無；PWA `start_url` 的處理在換網域或轉址舊公開頁前再做 | ⏸ 暫緩 |
| 4 | media 角色的時機 | **先由 admin 兼任**，後續視球團人力再決定 | media 角色移到第二階段；第一階段比賽日貼網址、輸入比分、發新聞都由 admin 做 | ✅ 已決定（延後） |
| 5 | Vercel 方案和帳號 | **先開在 Victor 名下**，費用含在對球團的報價中 | 帳號歸屬改為 Victor 代管；移交方式依第 6 項合約條款 | ✅ 已決定 |
| 6 | 共用 DB 的歸屬條款 | **先寫進合約**：資料屬於球團；實際移交日後再處理，短期不用 | 合約加資料歸屬與移交原則條款 | ✅ 已決定 |
| 7 | 設計風格 A／B／C | **未定** | 選定後，研究端補畫「賽後」和「休賽期」兩種主視覺 | ⏳ 待 Victor |

### 6.1 第 5 項的費用估算（2026-10-03 查詢，美元，匯率以 1:32 估算）

| 項目 | 每月費用 | 說明 |
|---|---|---|
| Vercel Pro | US$20 | 含 1 個部署帳號和 US$20 用量額度、1 TB 流量；官網和 Squadbase 可放在同一個 team |
| Supabase Pro（正式環境） | US$25 | 每個組織的基本費，含 US$10 運算額度，可支付一個 Micro 資料庫 |
| Supabase staging | US$0 或 US$10 | 留在免費方案為 0；放進同一個付費組織每月加 US$10 |
| 網域 | 約新台幣 500–1,000／年 | 球團已有網域就不用 |
| **合計** | **約 US$45–55／月（約新台幣 1,500–1,800）** | 報價時建議以每月新台幣 2,000 元作為主機與資料庫成本基準，另計維運與內容服務費 |

可能的額外費用（目前不需要）：
- Supabase 時間點還原（PITR）：每月 US$100；初期用每日自動備份即可。
- 簡訊 OTP：只有 Squadbase App 開放家長登入後才會產生，按簡訊數量計費，與官網無關。
- Vercel 額外帳號：每人每月 US$20，只有多人需要部署時才要。

來源：[Vercel Pro 方案](https://vercel.com/docs/plans/pro-plan)、[Supabase 價目](https://supabase.com/pricing)
