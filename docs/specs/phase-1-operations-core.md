# 第一階段 Spec：營運核心（Phase 1 — Operations Core）

> 版本：草案 v0.1 · 2026-10-01 · 基準：`main`（含 PR #50 藍圖）
> 母文件：[`docs/club-platform-blueprint.md`](../club-platform-blueprint.md)（以下簡稱「藍圖」）；所有決策引用藍圖 §7.1 的 D 編號。
> 讀者：Victor（審核）、實作的 cloud agent（一次領一個 PR）。

---

## 0. 範圍與共同規則

### 0.1 這一階段要達成什麼

上線並行季（D7）所需的最小營運核心：**報名 → 簽到扣堂 → 收款（轉帳、現金）→ 對帳 → 舊卡移轉**，全部在現有 Web App（PWA）完成，**不依賴 LINE**。LINE OA／LIFF 在第二階段把同一批頁面包進 LINE，不需要重寫商業邏輯。

### 0.2 不在這一階段

LINE Messaging API／LIFF／Rich Menu、官網 CMS 與體驗課預約、ICS 行事曆訂閱、AI 翻譯與公告擬稿、賽事召集流程、教練 LIFF（訓練指引、比賽日）、邀請碼綁定、同意紀錄、換季工具、`debit_policies` 設定表。這些另寫第二階段 spec（第 10 節列出建議順序）。

### 0.3 共同規則（每個 PR 都適用）

| 項目 | 規則 |
| --- | --- |
| 環境 | **只動 staging**。不碰 production、不部署 production |
| Migration | 新檔放 `supabase/migrations/`，時間戳 `YYYYMMDDHHMMSS` 合法且遞增；新增或改寫的函式在同一檔 `grant`／`revoke`，不再另開 `regrant_*` 檔 |
| 驗證 SQL | 每個有 DB 變更的 PR 附 `supabase/<主題>_verification.sql`（交易內執行、結尾 `rollback`）；PR-02 完成後改由 CI 執行 |
| 權限 | 寫入一律走 `security definer` RPC，函式開頭檢查角色，`set search_path = public`；表只 grant `select` 給需要的角色 |
| 金額 | 新台幣整數（`integer`），單價用 `numeric(12,4)`；所有金流紀錄**記下當下的價格**，不回頭讀方案目前的價格 |
| 時區 | 日期切分一律 Asia/Taipei（沿用 `club_today()`、`club_session_date()`） |
| i18n | 所有新 UI 文字同時加 `messages/zh-Hant.json`、`ja.json`、`en.json`，並加 key 一致性測試 |
| 測試 | 純函式放 `lib/**`，加 `*.test.ts` 並登記到 `package.json` 的 `test` script（PR-02 會改成自動收集） |
| 稽核 | PR-03 之後，所有管理類 RPC 都要寫 `audit_log` |
| 個資 | 不把真實姓名、電話、帳號、照片放進 repo、測試資料或 PR 描述 |
| PR 大小 | 一個 PR 一個主題；PR 描述列出驗收項目編號並逐項勾選 |

### 0.4 角色對照（本階段）

不新增 `app_role` 值。以 `admin` 涵蓋營運人員（香織）與梯隊總監；**職責分離靠 RPC 檢查「不同人」**（例：登記現金的人不能核對同一筆存款）。

| 現實角色 | 系統角色 | 本階段能做 |
| --- | --- | --- |
| 家長 | `parent` | 報名、取消、請假、QR 簽到、看課程卡、轉帳回報 |
| 梯隊教練 | `coach` | 看指派隊伍名單、評估（現有）；**不再**點名、不再讀堂數 |
| 香織（營運） | `admin` | 簽到確認、轉帳審核、存款核對、發票登記、舊卡移轉 |
| 梯隊總監 | `admin` | 收現金、日結、存款登記 |

---

## 1. PR 清單與順序

| PR | 主題 | 規模 | 依賴 | 決策 |
| --- | --- | --- | --- | --- |
| PR-01 | 付款申報價格快照（修 bug） | S | — | D8 |
| PR-02 | Supabase CLI、CI 資料庫測試、staging 自動套用 | M | — | — |
| PR-03 | 稽核紀錄 `audit_log` 與工作清單 `tasks` | M | PR-02 建議先完成 | — |
| PR-04 | 角色權限調整（教練不點名、不讀堂數）＋偏好語言欄位 | S | PR-03 | D6、§3.11 |
| PR-05 | 主梯隊＋跨上梯隊 | M | PR-03 | D10、D10-1 |
| PR-06 | 報名、取消、請假與扣堂規則（含欠堂上限） | M | PR-05 | D1、D2、D2-1、D3、D9 |
| PR-07 | 場地 QR 簽到與工作人員清點 | M | PR-06 | D11 |
| PR-08 | 收款：轉帳回報擴充、現金收據、日結、存款、發票 | L（可拆 08a／08b） | PR-01、PR-03 | D4、D12、D13、D14 |
| PR-09 | 實體課程卡數位化與並行季比對 | M | PR-06、PR-08 | D7、D8-1、D10 |

PR-01 與 PR-02 可以同時進行；其餘依表內依賴。

---

## PR-01 付款申報價格快照

**問題：** `payment_claims` 只存 `package_id`。`admin_review_payment_claim`（`20260906000000_stage4b_session_credits.sql`）在核准時讀方案**目前**的 `price_twd`／`credits`；營運儀表板（`lib/org/dashboard-queries.ts`）與堂數管理頁（`lib/credits/queries.ts`）的「家長貢獻／已核准匯款」也 join 目前價格。9/1 已調價（D8），改價會回溯改變歷史營收，待審申報會用新價入帳。

**DB：**
1. `payment_claims` 新增 `price_twd_snapshot integer`、`credits_snapshot integer`；以現有方案回填既有資料；回填後設 `not null`。
2. `submit_payment_claim` 寫入兩個快照欄位。
3. `admin_review_payment_claim` 改用快照計算單價與入帳堂數。
4. `admin_upsert_session_package`：若該方案已有任何申報，**禁止修改** `price_twd`、`credits`、`age_band`（只能改 `active`）；錯誤訊息引導「停用後新增方案」。

**App：**
- 儀表板與堂數管理頁的匯款金額改讀 `price_twd_snapshot`（或 `session_credit_ledger` 的 `purchase.amount_twd`，兩者擇一並在程式註解說明）。
- 方案編輯頁：已有申報的方案，價格與堂數欄位唯讀並顯示說明。

**驗收：**
- P01-1 建立申報後修改方案價格 → 被拒絕。
- P01-2 停用舊方案、新增新價方案；舊申報核准後入帳金額、堂數仍為舊值。
- P01-3 儀表板同一期間的已核准匯款，在新增新價方案前後數字不變。
- P01-4 `npm run lint`、`typecheck`、`test` 通過；新增 `lib/credits/packages.test.ts` 案例覆蓋快照計算。

---

## PR-02 Supabase CLI、CI 資料庫測試、staging 自動套用

**目標：** 不再手貼 SQL；每個 PR 在 CI 用乾淨資料庫跑完所有 migration 與驗證；合併後自動套用到 staging。

**內容：**
1. 加 `supabase/config.toml`（`supabase init`），確認 `supabase db reset` 能在本機與 CI 從零跑完 43 個 migration。處理已知問題：`20260906600000_*` 時間戳不合法（改名並在 README 記錄 staging 的對應方式）；需要分兩次執行的 `alter type ... add value`（確認在 CLI 下可行，必要時拆檔）。
2. **staging 歷史對齊：** 文件化並由 Victor 執行一次 `supabase migration repair --status applied <每個版本>`，讓 staging 的 migration 表與 repo 一致。PR 內附完整指令清單，不由 CI 自動執行。
3. **CI（`.github/workflows/ci.yml` 新增 job `db`）：** `supabase start` → `supabase db reset` → 依序執行 `supabase/*_verification.sql`（任何錯誤即失敗）→ 執行 pgTAP 權限矩陣（最小版本：anon／未綁定家長／已核准家長／指派教練／非指派教練／admin，對 `players`、`player_session_balances`、`session_credit_ledger`、`payment_claims`、`session_attendance` 的 select 與主要 RPC 的 execute）。
4. **staging 自動套用（新 workflow `db-staging.yml`）：** `push` 到 `main` 且 `supabase/migrations/**` 有變更時執行 `supabase db push`。所需 secrets（`SUPABASE_ACCESS_TOKEN`、`SUPABASE_DB_PASSWORD`、`SUPABASE_PROJECT_REF`）由 Victor 在 GitHub 設定；先以 `workflow_dispatch` 手動觸發驗證一次，確認後再開自動。**不建立任何 production workflow。**
5. `lib/supabase/database.types.ts` 改由 `supabase gen types typescript --local` 產生；CI 檢查產生結果與 repo 一致。**（實作時移到後續 PR：產生型別需要 Docker，且手寫型別檔有自訂別名，需要逐步改寫引用處。）**
6. `package.json` 的 `test` script 改為自動收集 `**/*.test.ts`（避免漏登記）。
7. README：把「Apply migrations (staging only)」改寫為 CLI 流程，舊的手貼步驟移到附錄。

**驗收：**
- P02-1 CI 的 `db` job 在乾淨環境跑完所有 migration 與驗證 SQL。
- P02-2 故意讓家長能讀 `session_credit_ledger` 的測試分支，pgTAP 失敗。
- P02-3 `workflow_dispatch` 對 staging 執行 `db push` 成功，且 staging 無 drift（`supabase db diff` 為空）。
- P02-4 （移到後續 PR）型別檔由工具產生，CI 比對通過。
- P02-5 staging 執行 repair 前，`supabase/baseline_objects_verification.sql` 確認 43 個既有 migration 的物件都在。

---

## PR-03 稽核紀錄與工作清單

**DB：**

```sql
audit_log(
  id bigserial pk, at timestamptz default now(), actor_id uuid,
  action text,            -- 例：'payment_claim.approve'
  entity_type text, entity_id uuid,
  before jsonb, after jsonb,
  processed_at timestamptz -- 供之後的通知（outbox）使用
)
tasks(
  id uuid pk, kind text, title_key text, params jsonb,
  entity_type text, entity_id uuid,
  assignee_role text,     -- 'staff' | 'director' | 'admin'（本階段皆對應 admin）
  assignee_id uuid null,
  status text check in ('open','snoozed','done','dismissed'),
  due_at timestamptz null, snoozed_until timestamptz null,
  dedupe_key text unique null,   -- 同一件事只開一張
  created_at, done_at, done_by
)
```

- `audit_log`：只有 admin 可 select；無 update／delete（trigger 擋下）。
- 共用函式 `public.write_audit(action, entity_type, entity_id, before, after)`、`public.open_task(kind, …, dedupe_key)`、`public.close_task_by_key(dedupe_key)`，供其他 RPC 呼叫。
- 既有 admin RPC 中，與金流和權限有關的先接上稽核：`admin_review_payment_claim`、`admin_adjust_session_credits`、`admin_upsert_session_package`、`admin_review_guardian_link`、`admin_revoke_guardian_link`、`mark_session_attendance`、`exportAdminPhotoPack`（Server Action 端寫入，記錄匯出人數）。

**App：**
- `/app/admin` 首頁最上方改為「工作清單」：依到期時間排序，可標記完成、延後、略過；每張任務連到對應頁面。
- 本 PR 先接上兩種任務：`payment_claim.pending`（家長送出轉帳回報）、`guardian_link.pending`。其他任務由後續 PR 加入。

**驗收：**
- P03-1 核准一筆申報 → `audit_log` 有一筆，`before`／`after` 狀態正確。
- P03-2 家長送出轉帳回報 → 出現一張任務；核准後自動關閉。
- P03-3 非 admin 讀不到 `audit_log` 與 `tasks`（pgTAP）。

---

## PR-04 角色權限調整＋偏好語言

**依據：** 藍圖 §3.11（教練不點名、不讀堂數、不碰金流），D6（依對方語言回覆）。

**DB：**
1. `mark_session_attendance`：移除 coach 分支，只允許 admin（PR-07 會再加家長 QR 簽到的專用 RPC）。
2. `player_session_balances_select` policy：移除 `coach_can_read_player` 條件。
3. `profiles` 新增 `preferred_language text check in ('zh-Hant','ja','en')`，預設 `null`；家長在 `/app/settings` 可設定；登入時若為 `null`，以當下網址的 locale 寫入。

**App：**
- `lib/auth/roles.ts`：`canTakeAttendance` 只回傳 admin；移除 `canReviewPayments`（未使用）。
- `/app/roster/**`：移除點名與堂數欄位，保留名單、照片、評估入口。
- `/app/settings`：新增語言偏好。

**驗收：**
- P04-1 指派教練呼叫 `mark_session_attendance` → `not authorized`。
- P04-2 指派教練讀 `player_session_balances` → 0 筆。
- P04-3 新家長第一次以 `/ja/login` 登入 → `preferred_language = 'ja'`。

---

## PR-05 主梯隊＋跨上梯隊

**依據：** D10（卡上「8.10」是 U8、U10 梯隊記號）、D10-1（一個主梯隊，另可加一個跨上梯隊；價格依主梯隊）。

**DB：**
1. `team_memberships` 新增 `squad_role text check in ('primary','cross')`；既有 age_squad membership 回填為 `primary`；competition_team 為 `null`。
2. `enforce_team_membership_rules`（最新版在 `20260911000000_player_membership_jersey_self_update.sql`）改寫 age_squad 分支：
   - `primary`：維持現有規則（band 必須等於依生日算出的梯隊；每人恰好 1 個 active primary）。
   - `cross`：每人最多 1 個 active cross；不得與 primary 同一隊；**不檢查生日 band**（由 admin 判斷）；需要已有 active primary。
   - 背號規則不變（`UNIQUE(team_id, jersey_number)`；cross 可不填背號）。
3. `player_active_on_session_team`（`20260906000000_stage4b_session_credits.sql`）與報名、Q&A、家長可讀場次的 helper（`guardian_can_read_session` 等）：age_squad 場次同時接受 primary 與 cross。
4. `player_team_catalog_band`：**只看 primary**（價格依主梯隊）。
5. 扣堂是否適用（`credits_apply_to_age_band`）維持依**場次所屬隊伍**的 band。
6. 管理員 RPC：`admin_set_cross_squad(player_id, team_id | null)`，寫稽核。

**App：**
- 球員詳情與編輯頁：顯示主梯隊，新增「跨上梯隊」選擇（只列 active age_squad，排除主梯隊）。
- 家長的訓練列表：cross 梯隊的場次也出現，標示「跨上」。
- `lib/org/squad-team.ts` 的 TS 規則同步調整並加測試。

**驗收：**
- P05-1 U8 主梯隊球員加上 U10 跨上 → 成功；再加第二個跨上 → 被拒。
- P05-2 該球員可報名並出席 U10 場次，扣堂依 U10 場次規則。
- P05-3 購買方案時價目依 U8（主梯隊）。
- P05-4 移除跨上後，看不到 U10 未來場次；已出席紀錄保留。

**已知限制：** 換季工具不在本階段；8/15 換季時主梯隊的 band 會失效，第二階段處理。

**實作說明（與上方規格的差異）：**
- 背號：`jersey_number` 仍為必填（欄位 NOT NULL、同隊不可重複）。跨上若不填背號，`admin_set_cross_squad` 會沿用主梯隊背號；該背號在跨上梯隊已被使用時會提示「背號已被使用」。
- 家長可讀場次：原本只要「曾經」在該隊（含已停用的 membership）就能看到場次，無法做到 P05-4。改為：目前 active 的 membership，或孩子已報名、已出席的場次。換主梯隊後，舊梯隊的未來場次也不再顯示。
- `admin_set_player_age_squad` 不再停用跨上梯隊；若把目前的跨上梯隊設為主梯隊，該筆會直接升為主梯隊。
- 營運儀表板的賽事出席歸屬、Torneopal 名單匯入都只看主梯隊；匯入不會移除管理員設定的跨上梯隊。
- 跨上梯隊只在編輯球員頁設定（新增球員時先存主梯隊）。

---

## PR-06 報名、取消、請假與扣堂規則

**依據：** D1（保留報名、依出席扣堂）、D2／D9（賽事一日 −1、特殊活動 −2）、D2-1（賽事與特殊活動 24 小時內取消或未到比照出席；正當理由經香織核准免扣）、D3（欠堂上限 3 堂）。

**現況比對（`compute_session_debit_plan`，最新版在 `20260909010000_stage6p1_friendly_matches.sql`）：** 例行出席 −1、無故缺席 0；特殊活動出席或無故缺席 −2；賽事同一比賽日只扣一次；核准請假 0。**扣堂表本身不需改。** 需要改的是取消、欠堂與點名阻擋。

**規則表（實作後的行為）：**

| 類型 | 報名 | 家長取消 | 24 小時內取消 | 未到 | 正當理由 |
| --- | --- | --- | --- | --- | --- |
| `regular` | 需要，不具約束力；未報名也可出席 | 開始前隨時可取消 | 不罰 | 0 | — |
| `special` | 需要 | 開始前 24 小時以前：正常取消 | 允許取消，但記為「臨時取消」→ 點名時視同無故缺席 → −2 | −2 | 家長提出請假並選理由；香織核准 → 0 |
| `cup`／`league`／`friendly` | 需要 | 同上 | 同上 → −1（同日只扣一次） | −1 | 同上 |

**DB：**
1. `session_registration_status` 新增值 `late_cancelled`（獨立 migration，先 `add value` 再使用）。
2. `cancel_session_registration`（最新版 `20260907010000_session_cancel_lock_24h.sql`）：移除家長 24 小時鎖；`regular` 一律 `cancelled`；`special`／賽事在開始前 24 小時內取消 → `late_cancelled`，並寫入取消時間。
3. 點名時，`late_cancelled` 的報名若沒有核准請假，**由系統在場次結束後自動記為 `unexcused_absent`**（見第 4 點），套用現有扣堂表。
4. 新增 `finalize_session_attendance(session_id)`（admin 或排程呼叫）：場次結束後，對 `special`／賽事中「已報名或臨時取消、沒有出席紀錄、沒有核准請假」的球員記 `unexcused_absent`；`regular` 不處理。由 PR-07 的「清點完成」按鈕呼叫；未清點的場次在結束後 24 小時由 Vercel Cron 呼叫（cron route 用 server-only secret 驗證）。
5. 請假：`session_leave_requests` 新增 `reason_category text check in ('illness','injury','family','school','other')`；`staff_review_leave_request` 只允許 admin（現況已是），寫稽核；核准後若已扣堂，自動沖銷。
6. **欠堂上限（D3）：**
   - `mark_session_attendance`（`raise exception 'insufficient credits'`）與新的簽到 RPC **不再因餘額不足而失敗**；允許 `credits_available` 變成負數：把 constraint `player_session_balances_credits_nonneg`（`>= 0`）改為 `>= -100` 的保護值。
   - **負餘額時的單價：** 欠堂扣堂時 ledger 的 `unit_cost_twd` 記為當下的平均單價（若從未購買則記 0，並在報表標示「欠堂」）；之後購買入帳時，若購買前餘額 `<= 0`，新的平均單價直接等於這次方案的單價（`admin_review_payment_claim` 現有的加權平均公式在負餘額時會失真，必須改寫並加測試）。
   - `register_player_for_session`（最新版 `20260904000000_stage4a_session_kinds_series.sql`）：若球員屬於需要扣堂的 band 且 `credits_available <= -3`，拒絕新的報名（`credit_limit_reached`）。
   - 任務：`credits_available <= 0` → 開「提醒續購」任務（dedupe 每位球員一張）；`<= -3` → 開「已達欠堂上限」任務給總監；回到 `> 0` 時自動關閉。
7. 沖銷單價：`mark_session_attendance` 改點名時的 `reversal` 改用**原扣堂紀錄的 `unit_cost_twd`**（現況用目前平均單價）。

**App：**
- 家長場次頁：`special`／賽事在 24 小時內按取消，先顯示確認對話框「臨時取消將扣 N 堂，若有正當理由請改用請假」。
- 請假表單加理由選單。
- 家長課程卡頁（現有 `/app/credits`）：餘額為負時以「欠 N 堂」顯示；達 −3 時顯示「請先續購才能報名」。
- 把扣堂規則抽成 `lib/credits/debit-rules.ts` 的對照測試：同一組 fixture（JSON）同時給 TS 測試與 PR-02 的 pgTAP 使用，確保 TS 與 SQL 一致。

**驗收：**
- P06-1 賽事開始前 30 小時取消 → `cancelled`，不扣；開始前 10 小時取消 → `late_cancelled`，場次結束後扣 1 堂。
- P06-2 特殊活動臨時取消並申請請假（生病），香織核准 → 不扣；若已扣則沖銷。
- P06-3 同一天兩場賽事都出席 → 只扣 1 堂。
- P06-4 例行訓練未報名直接出席 → 可記出席、扣 1 堂；已報名未到 → 不扣。
- P06-5 餘額 0 的孩子出席 → 記錄成功，餘額 −1，出現提醒任務。
- P06-6 餘額 −3 → 報名被拒（`credit_limit_reached`）；出席仍可記錄，餘額 −4，總監收到任務。
- P06-7 TS／SQL 扣堂 fixture 全部一致。

**實作說明（與上方規格的差異）：**
- **24 小時自動結算改用資料庫排程（pg_cron），不用 Vercel Cron。** App 目前沒有 service role key，若用 Vercel Cron 必須在 Vercel 新增高權限金鑰。改由資料庫每小時執行 `finalize_due_sessions()`，不需要任何新密鑰。部署後可在 SQL Editor 用 `select jobname, schedule from cron.job;` 確認排程存在。
- **部署當下已結束的場次一律標為「已結算」**，不會回頭補扣歷史場次。
- **家長不能再直接寫入報名表**（移除 RLS 的家長 insert／update policy）。原本可以繞過 24 小時規則與欠堂上限，現在一律走 RPC。App 原本就只用 RPC。
- 管理員代為取消一律是一般取消，不算臨時取消（例如球團停課）。
- 「批次取消整個系列」仍跳過 24 小時內的場次，避免一次產生多筆臨時取消；單場取消會先跳出確認視窗。
- 「已核准請假 → 不扣堂」維持原本行為：即使點名記為出席，有核准請假仍記為請假。
- `admin_adjust_session_credits`：欠堂時可以加堂；扣堂調整仍不能讓餘額變成負數。
- 點名名單：例行訓練除了已報名的球員，也列出梯隊其他球員，方便記錄「未報名直接出席」（D1）。
- 工作清單新增三種：請假待審（香織）、堂數用完提醒續購（香織）、已達欠堂上限（總監）。
- **未完成：** 報表中把「欠堂期間的扣堂」標示為欠堂。帳本已記下當時的平均單價（從未購買為 0），報表標示留到 PR-08 收款報表一起處理。

---

## PR-07 場地 QR 簽到與工作人員清點

**依據：** D11（家長掃球場櫃檯的 QR Code；工作人員於課程中清點人數後補登）。

**DB：**
1. `venues(id, name, address, checkin_token text unique, active)`；`checkin_token` 為隨機 32 字元，可由 admin 重新產生（舊 QR 立即失效）。
2. `training_sessions` 新增 `venue_id uuid null`（保留現有 `location` 文字欄位作顯示）；`session_series` 同步新增，產生場次時帶入。
3. `session_attendance` 新增 `source text check in ('staff','parent_qr','paper_card','system')` 與 `checked_in_at`。
4. `training_sessions` 新增 `headcount_confirmed_at`、`headcount_confirmed_by`、`headcount_n`。
5. RPC `parent_checkin(p_token text, p_player_ids uuid[])`：
   - 呼叫者必須是每位球員的已核准家長；
   - 依 `venue` ＋ 現在時間找出場次：`starts_at - 30 分鐘 <= now() <= ends_at`、active、未刪除、球員屬於該場次隊伍（含跨上）；一位球員若同時符合多個場次，回傳候選讓家長選；
   - 同一球員同一場次已有出席紀錄 → 直接回傳既有結果（冪等）；
   - 寫入 `present`（`source = 'parent_qr'`），套用 PR-06 扣堂規則；
   - 回傳每位球員的結果與簽到後餘額。
6. RPC `staff_confirm_headcount(session_id, headcount_n)`：記錄清點人數；呼叫 `finalize_session_attendance`；若 `headcount_n` 與出席人數不同，開任務「人數不一致」，**指派給梯隊總監**作為備援補登（現場工作人員也可以直接補登）。
8. **補登通知家長：** 每次以 `source = 'staff'` 補登出席，寫入一筆待發通知（`audit_log.processed_at is null`，`action = 'attendance.staff_backfill'`），內容使用三語範本、依家長偏好語言：
   - 繁中：「{孩子} 於 {日期} 的課程已出席，但未進行掃碼簽到，由工作人員代為補登記上課（扣 {N} 堂，剩餘 {M} 堂）。若有疑問請立即聯繫球團，謝謝。」
   - 日文、英文：同義翻譯（範本放在 `messages/*.json`，由 Victor 審稿）。
   - **第一階段**：家長在 App 的課程卡頁看到這則通知（未讀標記）。**第二階段**：同一筆待發通知改由 LINE 推播送出，不需改補登邏輯。
7. RPC `staff_remove_checkin(session_id, player_id, reason)`：刪除出席並沖銷扣堂，寫稽核（用於「簽了但沒來」）。補登沿用 `mark_session_attendance`（`source = 'staff'`）。

**App：**
- 公開路由 `/[locale]/checkin/[token]`：未登入 → 導向登入後回來（沿用 `safeAppNext`）；登入後顯示目前場次與名下可簽到的孩子（可多選）→ 送出 → 成功頁顯示「今天的日期已加到課程卡，剩餘 N 堂」。手機版優先，按鈕大。
- 管理端場次頁（`/app/admin/sessions/[id]`）新增「清點」區塊：已簽到名單（標示來源）、報名但未簽到名單、搜尋加入；輸入清點人數 → 「清點完成」。
- 管理端「場地」頁：場地列表、下載 QR（PNG 與可列印 PDF，含場地名稱與三語說明「請用 LINE 或手機相機掃描簽到」）、重新產生。
- 任務：場次結束 1 小時後仍未清點 → 開任務給 admin。

**驗收：**
- P07-1 開始前 31 分鐘掃碼 → 「目前沒有可簽到的課程」；開始前 29 分鐘 → 可簽到。
- P07-2 兄弟姊妹一次簽兩位 → 兩筆出席、各扣 1 堂。
- P07-3 重複掃碼 → 不重複扣堂。
- P07-4 非該孩子家長的帳號送出 → 被拒。
- P07-5 工作人員移除一筆 QR 簽到 → 出席刪除、堂數沖銷、稽核有紀錄。
- P07-6 清點人數與出席數不同 → 出現任務並指派給梯隊總監；補登後關閉。
- P07-8 補登一筆出席 → 家長課程卡頁出現補登通知（依偏好語言），內容含日期、扣堂數與剩餘堂數。
- P07-7 重新產生 QR 後，舊 token 立即無效。

**實作說明（與上方規格的差異）：**
- **補登通知用獨立的 `parent_notices` 表，不放在 `audit_log`。** 稽核紀錄只有 admin 能讀，而且除了 `processed_at` 不能修改，無法記「家長已讀」。`parent_notices.sent_at` 就是第二階段 LINE 推播的待發佇列；補登本身仍另寫一筆稽核（`attendance.staff_backfill`）。
- **移除簽到：** 帳本（`session_credit_ledger`）仍不可修改，唯一例外是出席紀錄被刪除時，帳本上對應的 `attendance_id` 會清成空值（外鍵 ON DELETE SET NULL）；金額與場次都保留，另加一筆沖銷。
- **簽到網址在 `/[locale]/app/checkin/[token]`**（在 `/app` 底下，沿用既有的登入導向）。QR 一律開中文版，登入後若家長設定了偏好語言，自動切換。
- **清點在課程中按下時，不會立刻結算未到**（場次還沒結束）；結算仍由 PR-06 的「結算未到」按鈕或結束 24 小時後的排程處理。
- **「結束 1 小時後仍未清點」任務只針對有設定簽到場地的場次**，並由每小時的排程開立，最多約晚 1 小時出現。
- **列印版是 A4 網頁**，用瀏覽器「列印／存成 PDF」；另提供 PNG 下載。未設定 `NEXT_PUBLIC_APP_URL` 時頁面會警告不要列印（否則 QR 會指向每次部署都不同的網址）。
- 新增課程時可選簽到場地（整個系列套用）；既有場次在場次頁設定（可選「同系列此場次之後也套用」）。

---

## PR-08 收款：轉帳回報擴充、現金收據、日結、存款、發票

**依據：** D4（總監確認、存入公司帳戶）、D12（購買與繳費通知給香織）、D13（現金由總監在球場收費）、D14（先記錄開票需求，沿用現行開票方式），以及現有 LINE OA「匯款回報」範本的欄位。

> 規模較大，建議拆 **08a（收款品項＋轉帳回報擴充＋發票）** 與 **08b（現金收據＋日結＋存款核對）**。

### 08a 收款品項、轉帳回報、發票

**DB：**
1. `payment_items(id, kind text check in ('credit_package','kit','match_fee','camp','other'), name_i18n jsonb, price_twd integer null, package_id uuid null, active)`；每個 active 的 `session_packages` 自動對應一個 `credit_package` 品項。
2. `payment_claims` 擴充（保留表名以免影響現有程式）：`method text check in ('transfer','cash')`（本表只用 `transfer`）、`transfer_date date`、`amount_twd integer`、`item_id uuid`、`invoice_needed boolean default false`、`invoice_tax_id text null`、`invoice_title text null`、`screenshot_path text null`（私有 bucket `payment-proofs`）。`package_id` 改為可為 null（非堂數品項）。
3. 核准規則：`credit_package` 品項 → 依 PR-01 快照入帳堂數；其他品項 → 只記錄收款，不動堂數錢包。
4. `invoices(id, payment_type, payment_id, tax_id, title, amount_twd, invoice_no text null, issued_at, issued_by)`；收款核准且 `invoice_needed` → 開任務「待開發票」；登記發票號碼後關閉。

**App：**
- 家長「繳費回報」頁（改寫現有 `/app/credits` 的申報表單）：孩子與梯隊自動帶入、選品項（堂數方案帶出價格；其他品項可輸入金額）、轉帳日期、末五碼、截圖上傳（選填）、是否需要發票與統編、抬頭。中日英三語。
- 管理端「收款審核」頁（現有 `/app/admin/claims`）：顯示截圖與所有欄位；核准、退回；發票欄位。
- 任務 `payment_claim.pending` 指派給香織（本階段即 admin）。

**08a 實作說明（與上方規格的差異）：**
- **家長不能再直接寫入 `payment_claims`**（移除家長 insert policy）。原本家長可以自填價格與堂數快照再送審，現在一律經 `submit_payment_report`。
- 「每位孩子只能有一筆待審申報」改為「每位孩子、每個項目一筆」，所以球衣與堂數方案可以同時待審。
- 堂數方案的金額一律取方案價格（家長填的金額會被忽略）；其他項目才用家長填的金額。
- 截圖存在私有 bucket `payment-proofs`，資料夾是孩子的 id；只有該孩子的已核准家長能上傳，admin 與該家長能看。送出失敗時上傳的截圖會留在 bucket（家長無刪除權），由 admin 需要時清理。
- 營運儀表板與堂數管理頁的「家長貢獻」只算堂數方案；球衣等收款會在 08b 的「收款明細」報表呈現。
- 舊的 `submit_payment_claim` 仍可用（轉呼叫新函式，轉帳日期記為當天）。

### 08b 現金收據、日結、存款

**DB：**
1. `cash_receipts(id, receipt_no text unique, player_id, item_id, amount_twd, credits_snapshot int null, price_twd_snapshot int null, received_at, received_by, closing_id uuid null, voided_at, voided_by, void_reason)`；`receipt_no` 格式 `C-YYYYMMDD-NNN`（台北日期，當日流水號）。
2. RPC `director_record_cash(player_id, item_id, amount_twd, …)`：建立收據；若為堂數方案，立即入帳（ledger `purchase`，`unit_cost` 用快照）；寫稽核。作廢只能在日結前，作廢會沖銷入帳。
3. `cash_closings(id, closing_date, total_twd, receipt_count, closed_by, closed_at)`；RPC `director_close_cash_day(date)`：彙總當日未日結的收據並鎖定（之後不能作廢）。
4. `bank_deposits(id, deposit_date, amount_twd, slip_path text null, recorded_by, recorded_at, reconciled_by, reconciled_at, note)`；`bank_deposit_closings(deposit_id, closing_id)` 多對多。
5. RPC `director_record_deposit(deposit_date, amount_twd, closing_ids[], slip)`；RPC `staff_reconcile_deposit(deposit_id)`：**呼叫者不能是 `recorded_by`**，且所選日結的總額必須等於存款金額，否則拒絕。
6. 任務：當日有收據且 22:00 前未日結 → 總監；日結後 7 天未登記存款 → 總監；存款已登記未核對 → 香織。

**App：**
- 總監頁「收現金」（手機優先）：搜尋孩子 → 選品項 → 金額 → 確認 → 顯示收據號碼。
- 家長端：課程卡頁顯示「收款紀錄」，含現金收據號碼與金額（**電子收據**；LINE 推播在第二階段）。
- 總監頁「日結」與「存款登記」；香織頁「存款核對」。
- 報表（現有 `/app/admin/reports`）新增「收款明細」（轉帳＋現金，含發票狀態）。

**驗收：**
- P08-1 家長回報「球衣」轉帳 → 核准後不影響堂數，收款報表有一筆。
- P08-2 家長回報堂數方案並勾選發票 → 核准後堂數入帳、出現「待開發票」任務；登記發票號碼後關閉。
- P08-3 總監登記現金堂數方案 → 家長課程卡立即看到收據與堂數。
- P08-4 日結後作廢收據 → 被拒。
- P08-5 總監登記存款後自己按核對 → 被拒；香織核對且金額相符 → 成功；金額不符 → 被拒。
- P08-6 收款報表 CSV／XLSX 三語表頭，不含家長電話與銀行帳號。

---

## PR-09 實體課程卡數位化與並行季比對

**依據：** D7（並行一季）、D8／D8-1（舊卡每堂 300 元、照舊價用完）、D10（「8.10」為梯隊記號）。藍圖 §3.10。

**DB：**
1. `credit_ledger_entry_type` 新增 `opening_balance`。
2. `paper_cards(id, player_id, card_no text, package_credits int, unit_cost_twd numeric(12,4) default 300, squad_marks text[], used_dates date[], remaining int, status text check in ('draft','confirmed','retired'), photo_paths text[], extracted jsonb, confirmed_by, confirmed_at)`。
3. RPC `admin_confirm_paper_card(card_id, final_used_dates date[], remaining int)`：
   - 寫一筆 ledger `opening_balance`（`amount = remaining`，`unit_cost_twd = 300`，`reason` 含卡號）並更新餘額與加權平均單價；
   - 每個已使用日期寫入 `session_attendance`：能對應到該球員梯隊（含跨上）當天的場次 → `present`、`source = 'paper_card'`、`credits_debited = 0`（不重複扣堂）；對應不到 → 寫入 `paper_card_unmatched_dates`，不建立場次；
   - 確認後刪除 `photo_paths` 指向的檔案（只保留 `extracted`）。
4. `paper_card_checks(id, player_id, check_date, card_remaining int, system_remaining int, photo_path null, checked_by)`：並行季每週抽查；不一致 → 開任務。

**AI 擷取（Server Action，server-only）：**
- 使用 `@anthropic-ai/sdk`，API key 放 Vercel 環境變數 `ANTHROPIC_API_KEY`（**不得**為 `NEXT_PUBLIC_*`）；模型 `claude-opus-5-5`。
- 輸入：卡片正反面照片。輸出用結構化輸出（JSON schema）：`card_no`、`package_credits`、`squad_marks`、`cells[]`（每格 `{index, text, date | null, confidence: 'high'|'low'}`）、`terms_detected`。
- 解析後由 `lib/credits/paper-card.ts` 純函式做第二層檢查：日期是否落在該球員梯隊的訓練日；不是 → 標為 `low`。
- API 錯誤、拒答或 JSON 不合 schema → 該卡標為「需人工輸入」，不阻擋流程。
- 每次呼叫記錄於 `ai_jobs(id, kind, model, input_ref, output jsonb, status, cost_usd null, created_by, created_at)`；照片不送任何第三方以外的地方，不寫 log。

**App：**
- 管理端「舊卡移轉」頁：上傳正反面照片（手機拍照）→ 顯示擷取結果，30 格依序排列，`low` 的格子標黃；可以手動修改日期與剩餘堂數 → 確認。
- 「並行比對」頁：選孩子 → 輸入卡上剩餘堂數（或拍照擷取）→ 與系統比對。
- 儀表板顯示：已移轉卡片數／在籍球員數；本季不一致次數。

**驗收：**
- P09-1 以測試用的合成卡片照片（**不得使用真實卡片**）擷取 → 30 格結果；刻意寫模糊的格子被標為 `low`。
- P09-2 確認後：餘額＝卡上剩餘；ledger 有 `opening_balance`（單價 300）；已使用日期中對得上的場次有 `paper_card` 出席紀錄，且沒有額外扣堂。
- P09-3 移轉後家長出席新場次 → 扣堂的單價為 300（加權平均單價正確）。
- P09-4 照片在確認後從 bucket 刪除。
- P09-5 並行比對不一致 → 出現任務。
- P09-6 未設定 `ANTHROPIC_API_KEY` 時，頁面可改為純手動輸入。

---

## 10. 第二階段 spec 預告（不在本文件範圍）

依藍圖路線圖，建議順序：

1. 邀請碼綁定、同意紀錄、隱私權政策頁（上線對外前必做）
2. 既有 LINE OA 開啟 Messaging API、LINE Login、LIFF 包裝本階段的家長頁（報名、簽到、課程卡、繳費回報）與總監頁
3. 個人通知（入帳、電子收據、欠堂、臨時取消提醒）與 outbox 消費
4. AI 翻譯（依偏好語言）、公告擬稿、匯款回報文字解析（並行期間）
5. 賽事召集流程、帶隊教練 `match_staff`、教練 LIFF（比賽日、評估、訓練指引）
6. 官網 CMS、體驗課預約、ICS 行事曆訂閱
7. `debit_policies` 設定表、換季工具（2027-08-15 前）

## 11. 審核結果（2026-10-01，Victor）

| # | 問題 | 決議 |
| --- | --- | --- |
| 1 | 香織與總監都用 `admin`，職責分離靠 RPC 檢查「不同人」 | 同意 |
| 2 | 跨上梯隊是否限制只能往上跨一級 | 不限制，由 admin 判斷（PR-05 原設計） |
| 3 | 臨時取消與未到的扣堂時間點 | 同意（清點完成時處理；未清點則結束後 24 小時）。另加：人數落差自動通報梯隊總監補登；補登後通知家長（PR-07 第 8 點） |
| 4 | 欠超過 3 堂仍可記錄出席，只擋新的報名 | 同意 |
| 5 | QR 有效時間 | 開始前 30 分鐘到結束（原設計） |
| 6 | 現金提醒 22:00、存款期限 7 天 | 同意 |
| 7 | 舊卡已使用日期 | **轉成歷史出席紀錄（不扣堂）**（PR-09 原設計） |
