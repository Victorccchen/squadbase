# 第二階段 Spec：LINE 化與對外（Phase 2 — LINE & Engagement）

> 版本：草案 v0.1 · 2026-10-03 · 基準：`main`（含第一階段 PR-01～PR-09）
> 母文件：[`docs/club-platform-blueprint.md`](../club-platform-blueprint.md)（藍圖）；第一階段 spec：[`phase-1-operations-core.md`](phase-1-operations-core.md)。決策沿用藍圖 §7.1 的 D 編號，本文件新增的待決定事項從 **D16** 起編（第 12 節）。
> 讀者：Victor（審核）、實作的 cloud agent（一次領一個 PR）。
> PR 編號接續第一階段：**PR-10～PR-23**，驗收項目寫成 `P10-1` 這種格式。

---

## 0. 範圍與共同規則

### 0.1 這一階段要達成什麼

第一階段把營運核心搬進系統；第二階段把**家長與教練每天碰到的入口**換成 LINE，並補齊對外上線前必做的法遵與綁定：

1. **上線對外前必做**：邀請碼綁定（取代開放搜尋）、同意紀錄與隱私權政策頁。
2. **LINE 化**：LINE 登入、LIFF 包裝第一階段已完成的家長／總監頁、角色選單、個人推播、Webhook。
3. **減少人工**：AI 翻譯與公告擬稿、繳費截圖與文字解析、賽事召集自動追蹤、教練用母語寫評估與訓練指引。
4. **看得到**：ICS 行事曆訂閱、官網 CMS 與體驗課預約。
5. **規則可設定**：扣堂規則表 `debit_policies`、季度與換季工具（2027-08-15 前）。

並行季（D7）期間第二階段同步進行；**並行季的實際資料優先於本 spec**。例如若家長多半不綁 LINE，就先加強 Web 入口，不硬推 LIFF。

### 0.2 不在這一階段

家長訊息 AI 分流（A5）、銀行對帳單自動配對、金流商線上付款、每週營運摘要（A7）、原生 App、家戶（`households`，一次替多個孩子付款）、電子發票串接（D14）。這些都等觸發條件出現再評估（藍圖 §6 階段 3）。

### 0.3 共同規則（沿用第一階段 §0.3，以下為新增或修改）

| 項目 | 規則 |
| --- | --- |
| 環境 | **只動 staging**。staging 使用**獨立的 LINE 測試 Provider／測試官方帳號**（D17），絕不推播給真實家長 |
| 機密 | LINE Channel secret、Channel access token、Anthropic API key 只放在 Vercel 環境變數或 Supabase Vault；**不進 git、不進 PR 描述、不進 `NEXT_PUBLIC_*`**。`.env.example` 只寫變數名稱與說明 |
| 背景工作權限 | 依 D16：預設**不在 App 放 service role key**。背景推播由資料庫（pg_cron＋pg_net＋Vault）執行；沒有登入身分的端點（Webhook、ICS）只透過 `security definer` RPC，並以 token 或密鑰驗證 |
| 外部呼叫 | 所有 LINE／Anthropic 呼叫都要有逾時、錯誤紀錄（不記內文中的個資）、失敗不影響主流程 |
| 推播 | 所有對家長的訊息走 `notifications` outbox（PR-14）；群發與 AI 草稿一律「人確認後才送」（藍圖 §4.1） |
| 語言 | 收訊者的 `profiles.preferred_language`；沒有設定時用 zh-Hant。群組公告同時附繁中與日文（D6） |
| 驗證 SQL | 沿用：每個有 DB 變更的 PR 附 `supabase/<主題>_verification.sql`，CI 執行；新 RPC 加入 `rls_matrix_verification.sql` 的 anon 禁止清單 |
| 本機 CI | 沒有 pg_net、pg_cron、Vault 的環境（CI 本機 Postgres）要能套用 migration：用 `if exists (select 1 from pg_extension …)` 包起來，驗證 SQL 用假的送信函式測組訊息邏輯 |
| Web Push | 凍結（藍圖 §5）：不再擴充；LINE 推播穩定後再決定是否移除 |
| 個資 | 測試資料一律合成；LINE user ID、照片、電話不得出現在 repo、log 或 PR 描述 |

### 0.4 角色對照（相對第一階段）

| 現實角色 | 系統角色 | 第二階段新增 |
| --- | --- | --- |
| 家長 | `parent` | LINE 登入、LIFF、邀請碼綁定、同意、召集回覆、填緊急聯絡與過敏 |
| 梯隊教練 | `coach` | LIFF：我的行程、比賽日、評估、訓練指引、「給工作人員」 |
| 香織（營運） | `admin` | 發邀請碼、群發公告（AI 擬稿）、召集、CMS、潛在學員、翻譯確認 |
| 梯隊總監 | `director` | LIFF：收現金、日結、存款（第一階段頁面包進 LIFF） |
| 成人隊球員（含兼任教練） | `player` | 只在 PR-18 做「帶隊教練當天是否有成人隊比賽」的衝突提示；成人隊個人入口留到之後 |

---

## 1. PR 清單與順序

| PR | 主題 | 規模 | 依賴 | 決策 |
| --- | --- | --- | --- | --- |
| PR-10 | 邀請碼綁定（取代開放搜尋） | S–M | — | D19、D20 |
| PR-11 | 同意紀錄與隱私權政策頁 | M | — | D24 |
| PR-12 | LINE 登入（Supabase 自訂 OIDC）與帳號連結 | M | PR-11 建議先完成 | D16、D17、D18 |
| PR-13 | LIFF 骨架、角色選單、簽到 QR 改 LIFF 連結 | M | PR-12 | D18 |
| PR-14 | 通知 outbox 與 LINE 個人推播 | M–L | PR-12 | D16、D21、D22 |
| PR-15 | LINE Webhook（好友狀態、收訊、按鈕回覆） | M | PR-14 | D16 |
| PR-16 | AI 翻譯、用語表、公告擬稿與分眾群發（A1、A2、A6） | M–L | PR-14 | D27 |
| PR-17 | 繳費 AI：截圖擷取（A3）與匯款回報文字解析（A8） | M | PR-15 | — |
| PR-18 | 賽事召集流程與帶隊教練 `match_staff` | L | PR-14、PR-15 | D25 |
| PR-19 | 教練 LIFF：我的行程、比賽日、訓練指引；緊急聯絡與過敏 | M–L | PR-16、PR-18 | D28 |
| PR-20 | ICS 行事曆訂閱 | S–M | — | — |
| PR-21 | 官網 CMS、體驗課預約、SEO | M–L | — | D26 |
| PR-22 | 扣堂規則表 `debit_policies` | S–M | — | — |
| PR-23 | 季度、在籍與換季工具 | M | — | 2027-08-15 前 |

**建議批次（不是排程）：**

- **第一批，可以馬上開始**：PR-10、PR-11、PR-20。都不依賴 LINE 後台設定，PR-20 是快速見效的項目。
- **第二批，LINE 化核心**：PR-12 → PR-13 → PR-14 → PR-15。開始前 Victor 要先完成第 11 節的 LINE 後台設定。
- **第三批**：PR-16、PR-17、PR-18、PR-19。依並行季的回饋決定先後。如果 LINE 對話量大，先做 PR-16；如果召集最累，先做 PR-18。
- **第四批**：PR-21、PR-22、PR-23。PR-23 必須在 2027-08-15 前完成。

---

## PR-10 邀請碼綁定

**問題：** 現行綁定是家長搜尋孩子姓名（`search_player_for_guardian_link`），再由管理員審核。缺點有兩個：一是能用姓名試出其他孩子是否在籍（簡報 R1），二是每筆申請都要香織手動審。

**DB：**
1. `player_invite_codes(id, player_id, code_hash text, code_hint text, expires_at, used_by, used_at, revoked_at, created_by, created_at)`：
   - 碼本身只存雜湊（`extensions.digest`）。`code_hint` 只存末 2 碼，方便工作人員辨認。
   - 碼的長度為 8 碼，排除容易混淆的字元（0/O、1/I/L）。有效期預設 60 天。
   - 同一位孩子同時只有一個有效碼；重發時舊碼自動作廢。
2. RPC `admin_issue_invite_code(player_id) → text`：回傳明碼（**只在這一次回傳**），寫入稽核紀錄。
3. RPC `admin_revoke_invite_code(player_id)`。
4. RPC `redeem_invite_code(code text, birth_date date, relation)`：
   - 碼有效、未使用、未過期，而且生日相符 → 直接建立 `approved` 的家長連結，碼標記為已使用。
   - 失敗回傳同一個錯誤訊息「碼或生日不正確」，不透露是哪一個錯。
   - **嘗試次數限制**：同一位使用者 1 小時內最多 5 次失敗，超過就鎖 1 小時。失敗次數記在 `invite_redeem_attempts`。
   - 已經是這個孩子的家長 → 回傳成功，不重複建立。
5. 同一位孩子可以有多位家長：第二位家長要用新碼，由工作人員再發一次。
6. 依 D20 處理開放搜尋：關閉家長端的 `search_player_for_guardian_link`（revoke execute，或改為只有 admin 能用）；**保留**管理員手動建立連結的功能。

**App：**
- 管理端「綁定」頁新增邀請碼功能（D19）：
  - 每位孩子有「發邀請碼」按鈕，產生**列印用小卡**。小卡內容：孩子名字的第一個字＋「同學」、邀請碼、QR Code（PR-13 之後改成 LIFF 深連結；之前連到 `/app/children/redeem?code=`），以及三語說明。
  - 也可以批次為一個梯隊列印 A4，每頁 8 張。
- 家長端「我的孩子」頁：輸入邀請碼＋孩子生日 → 立即綁定成功，畫面顯示孩子姓名。
- 已經核准的舊綁定不受影響。

**驗收：**
- P10-1 正確的碼加上正確的生日 → 立即綁定；同一個碼再用一次 → 失敗。
- P10-2 碼正確但生日錯，或碼錯 → 回傳同樣的錯誤訊息；連續 6 次失敗 → 被鎖。
- P10-3 重發後舊碼失效；過期的碼失效。
- P10-4 家長無法再用姓名搜尋孩子；管理員仍可以手動建立連結。
- P10-5 資料表沒有任何明碼（驗證 SQL 檢查 `code_hash` 不等於明碼）。

---

## PR-11 同意紀錄與隱私權政策頁

**依據：** 藍圖 §2.1（法遵頁面）、§3.1 `consents`、§3.4 購買條款。文案由球團提供（D24）；程式先用標示「待球團提供」的佔位文字。

**DB：**
1. `policy_documents(id, kind text, version int, locale text, title, body_md, published_at, created_by)`：
   - `kind`：`privacy`（個資告知，必要）、`photo_use`（肖像使用，選擇性）、`id_documents`（證件用於賽會報名，選擇性）、`purchase_terms`（購買條款，購買時必要）。
   - 每個 `kind`＋`version` 都要有三語版本，其中 zh-Hant 必填。
   - 已發布的版本不能修改，只能發布新版本。
2. `consents(id, user_id, player_id null, kind, version, granted boolean, granted_at, revoked_at, source text)`：只能新增；撤回就新增一筆 `granted = false` 的紀錄。
3. RPC：
   - `record_consent(kind, version, player_id, granted)`。
   - `my_consent_status()`：回傳每個 kind 的目前版本與自己的同意狀態。
   - `admin_publish_policy(kind, locale_bodies jsonb) → version`。
4. 稽核：發布新版本與撤回同意都寫入 `audit_log`。

**App：**
- 公開頁 `/[locale]/privacy`、`/[locale]/terms`：讀取已發布的最新版本（ISR，發布時 revalidate tag），頁尾附連結。
- **同意閘門**：家長登入後，如果 `privacy` 的最新版本還沒同意，進入 `/app` 時先導到 `/app/consent`。
  - 隱私告知必須同意才能繼續。
  - 肖像使用與證件用途是**每個孩子各自勾選**，不勾也能繼續。
  - 政策改版（version 增加）時再問一次。
- 繳費回報（第一階段的 `PaymentReportForm`）與現金收款前：如果還沒同意目前版本的 `purchase_terms`，顯示條款並要求勾選。
- 管理端：
  - 政策文件編輯與發布頁。
  - 每位孩子的同意狀態欄位。
  - **匯出聯盟報名 ZIP 時，排除沒有同意證件用途的孩子的證件**，並列出名單提醒工作人員。

**驗收：**
- P11-1 新家長登入 → 先看到隱私告知，同意後才進入。
- P11-2 發布新版本 → 下次進入時再問一次；舊的同意紀錄仍然保留。
- P11-3 沒有同意證件用途的孩子 → 匯出 ZIP 時不含證件，並列在提醒名單上。
- P11-4 已發布的版本無法修改；`consents` 只能新增。
- P11-5 公開頁三語皆可顯示；日文或英文缺少時退回顯示繁中。

---

## PR-12 LINE 登入（Supabase 自訂 OIDC）與帳號連結

**做法：** Supabase Auth 已支援**自訂 OAuth/OIDC Provider**。LINE Login 用手動設定接上（issuer `https://access.line.me`），家長用 LINE 登入後就是一般的 Supabase session，RLS 與所有 RPC 不用改。

**已知限制：**
- LINE Web 登入的 ID token 用 HS256 簽章，Supabase 自訂 Provider 只支援 ES256。因此設定時要**不填 JWKS URI**，改由 userinfo 端點取得身分（社群已驗證的做法）。
- 部分 LINE 使用者沒有 email，要開啟「允許沒有 email 的使用者」。
- 實作第一步必須在 staging 實際驗證整個流程。如果自訂 Provider 不可行，**停下來回報**，改用替代方案：伺服器驗證 LIFF ID token（`POST https://api.line.me/oauth2/v2.1/verify`）後建立 session。替代方案需要 service role key，屬於 D16 的另一個選項，由 Victor 決定。

**前置（Victor 在後台操作，見第 11 節）：**
- LINE Login channel 必須和官方帳號的 Messaging API channel 在**同一個 Provider**（D18）。只有同一個 Provider，LINE 登入取得的 user ID 才會和推播用的 user ID 相同。
- 在 LINE Login channel 設定「連結的官方帳號」，並在授權網址加上 `bot_prompt=aggressive`，讓家長登入時順便加好友。

**DB：**
1. `line_accounts(user_id pk, line_user_id unique, display_name, picture_url null, language text, is_friend boolean default false, friend_changed_at, linked_at)`：
   - 由 RPC `sync_my_line_account()` 從 `auth.identities`（provider = 自訂 LINE provider）讀出 `sub` 後寫入，**不接受 client 傳入的 LINE ID**。
   - 只有本人和 admin 能讀。
2. `profiles.preferred_language`：如果是 null，用 LINE 回報的語言設定（ja → ja，zh-TW／zh-Hant → zh-Hant，其他 → en）；**之後由本人自己改**。

**App：**
- 登入頁新增「用 LINE 登入」作為**主要按鈕**，SMS OTP 改為次要選項（保留給管理員與沒有 LINE 的人）。
- 已經用手機登入的家長：在「設定」頁按「連結 LINE」（Supabase `linkIdentity`，需要開啟手動連結），之後兩種方式都能登入同一個帳號。
- 登入後呼叫 `sync_my_line_account()`。
- `proxy.ts`：LINE 登入回呼路徑加入白名單，`next` 參數只允許站內路徑。

**驗收：**
- P12-1 新家長用 LINE 登入 → 建立帳號 → 進入同意閘門（PR-11）→ 綁定孩子（PR-10）。
- P12-2 手機帳號連結 LINE 後，兩種方式登入都是同一個帳號，看得到同樣的孩子。
- P12-3 `line_accounts.line_user_id` 只能從伺服器端身分寫入；client 無法偽造（驗證 SQL：直接 insert 被拒，RPC 忽略參數）。
- P12-4 staging 只接測試 Provider（D17）。

---

## PR-13 LIFF 骨架、角色選單、簽到 QR 改 LIFF 連結

**DB：**
1. `line_rich_menus(role text pk, rich_menu_id text, updated_at)`：記錄每個角色對應的 Rich Menu。
2. 角色變更時，要對該使用者重新連結 Rich Menu：寫一筆 `line_tasks(kind = 'link_rich_menu', user_id)`，由 PR-14 的送信工作處理。如果 PR-14 還沒上線，就先只建表，不送出。
   - 角色優先順序：admin > director > coach > parent。

**App：**
- **一個 LIFF App**，端點為 `https://<host>/liff`：
  - 用 `@line/liff` 初始化，依照 `liff.state` 或路徑轉到站內頁面，例如 `/liff/card` 轉到 `/[locale]/app/credits`。
  - locale 依偏好語言決定。
  - 沒有 session 時自動走 LINE 登入（PR-12）。在 LINE 內這是無感登入。
  - LIFF ID 是公開值，可以放在 `NEXT_PUBLIC_LIFF_ID`。
- 第一階段的頁面直接沿用，只調整：
  - 在 LIFF 內隱藏站台頁首與導覽（`useIsInLiff`），改用 LINE 的返回鍵。
  - 版面再確認一次手機單手操作（按鈕高度至少 44px）。
- **選單對照：**

  | 角色 | Rich Menu 按鈕 → 頁面 |
  | --- | --- |
  | 家長 | 我的課程卡 `/app/credits`、報名 `/app/sessions`、簽到（開相機掃 QR，`liff.scanCodeV2`）、繳費回報 `/app/credits#pay`、我的孩子 `/app/children`、聯絡球團（開對話） |
  | 梯隊總監 | 收現金 `/app/cash`、日結與存款 `/app/cash#close`、工作清單 `/app`、家長選單 |
  | 香織（admin） | 工作清單 `/app/admin`、今日場次 `/app/admin/sessions`、舊卡比對 `/app/admin/paper-cards/checks`、發公告（PR-16） |
  | 教練 | 我的行程、比賽日、球員評估、訓練指引、給工作人員（PR-19 完成前，未完成的按鈕先連到「準備中」頁） |

- Rich Menu 圖片：提供 2500×1686 的範本（SVG 轉 PNG，三語共用圖示＋繁中／日文雙語標籤），放在 `public/line/`。可以改用球團自己的設計。
- Rich Menu 建立與預設選單：寫一支 `scripts/line-richmenu.ts`，由 Victor 在自己的電腦用 token 執行一次。token 只從環境變數讀取，不寫進檔案。
- **簽到 QR 改用 LIFF 連結**：`https://liff.line.me/{liffId}/checkin/{token}`。
  - 舊的 `/app/checkin/{token}` 繼續可用，所以已經印好的 QR 不會失效。
  - 場地 QR 列印頁改用新連結，並提示「建議重新列印」。

**驗收：**
- P13-1 在 LINE 內開啟 LIFF 連結 → 免登入看到課程卡。
- P13-2 角色不同的使用者看到不同的 Rich Menu；角色變更後在下一次送信批次中更新。
- P13-3 用 LINE 掃場地 QR → 開啟 LIFF 簽到頁並完成簽到；舊 QR 仍然可用。
- P13-4 在 LIFF 外（一般瀏覽器）所有頁面照常運作。

---

## PR-14 通知 outbox 與 LINE 個人推播

**依據：** 藍圖 §3.6、§3.9；第一階段的 `parent_notices`（PR-07）與 `audit_log.processed_at`。

**DB：**
1. `notification_templates(kind, locale, body text, flex jsonb null, updated_by, updated_at)`：
   - 三語範本，佔位符寫成 `{player}`、`{credits}` 這種格式。
   - 由工作人員在後台修改，不用部署。
2. `notifications(id, kind, user_id, player_id null, params jsonb, channel text default 'line', status text check in ('pending','sending','sent','failed','skipped'), attempts int, not_before timestamptz, sent_at, error text, dedupe_key unique null, created_at)`：
   - 所有對家長的推播都經過這張表。
   - 同時取代 `parent_notices`：舊表的資料搬過來，App 內的「通知」列表改讀新表。
3. **產生來源**（觸發器或既有 RPC 內呼叫 `enqueue_notification(kind, user_id, player_id, params, dedupe_key)`），收件人是孩子的所有已核准家長：

   | kind | 觸發 | 備註 |
   | --- | --- | --- |
   | `credits.purchased` | 轉帳核准、現金收款（含收據號碼與剩餘堂數） | 現金收款就是 D13 的電子收據 |
   | `credits.low` | 餘額 ≤ 2（每次跨過門檻只發一次） | 自動，不需人工 |
   | `credits.owed` | 餘額 ≤ 0 | 附繳費回報連結 |
   | `credits.limit_reached` | 餘額 ≤ −3（新的報名被擋） | 同時保留第一階段的總監任務 |
   | `attendance.backfilled` | 工作人員補登（原 `parent_notices`） | |
   | `registration.late_cancel` | 24 小時內取消特殊活動或賽事 | 提醒會扣堂，以及如何申請請假 |
   | `leave.reviewed` | 請假核准或不核准 | |
   | `paper_card.moved` | 舊卡移入（PR-09） | 附數位卡連結 |

4. **送信（D16 建議方案）**：pg_cron 每分鐘執行 `deliver_notifications()`：
   - 取出 `pending` 且 `not_before <= now()` 的通知，以及有 LINE 帳號、而且是好友（`is_friend`）的收件人。
   - 依收件人的語言套用範本，再透過 pg_net 呼叫 LINE push API。token 從 `vault.decrypted_secrets` 讀取，只有 security definer 函式讀得到。
   - 同一位收件人在同一批次的多則訊息合併成一則，最多 5 個 message object。
   - pg_net 是非同步的：另一個工作讀 `net._http_response` 更新狀態。失敗最多重試 3 次（間隔 1、5、30 分鐘）；4xx 錯誤不重試，直接標記 `failed`。
   - 沒有 LINE 或不是好友的收件人 → 標記 `skipped`。訊息仍然顯示在 App 內通知列表。
   - **靜音時段（D21）**：台北時間 21:30–07:30 產生的通知，`not_before` 延到 07:30；停課等「緊急」類別例外。
   - **月用量（D22）**：`line_usage_monthly` 記錄已送出的則數。達到上限的 80% 時開任務給 admin；達到 100% 時暫停非緊急類別。
5. Rich Menu 連結（PR-13 的 `line_tasks`）也由同一個工作送出。

**App：**
- 後台「通知範本」頁：三語編輯，並用假資料預覽。
- 後台「推播紀錄」頁：最近 7 天的狀態與失敗原因；不顯示訊息全文，只顯示類別與收件人名稱。
- 家長端「通知」列表改讀 `notifications`（自己的通知）。

**驗收：**
- P14-1 核准轉帳 → 家長在 1 分鐘內收到 LINE「入帳」通知，內容是他的語言，附剩餘堂數。
- P14-2 現金收款 → 家長收到電子收據（收據號碼＋金額）。
- P14-3 22:00 產生的通知在隔天 07:30 才送出。
- P14-4 不是好友的家長 → 狀態為 `skipped`，App 內仍看得到通知。
- P14-5 LINE API 回傳 5xx → 重試；回傳 4xx → 標記 `failed`，不重試。
- P14-6 本機 CI（沒有 pg_net）→ migration 可以套用，驗證 SQL 以假的送信函式測試「選收件人＋套範本＋合併」。

---

## PR-15 LINE Webhook

**DB：**
1. RPC `line_ingest_events(p_events jsonb, p_secret text)`：
   - security definer，只有 `p_secret` 等於 Vault 裡的 ingest secret 才接受。
   - 處理以下事件：
     - `follow`／`unfollow` → 更新 `line_accounts.is_friend`。如果還沒有帳號，先記在 `line_followers(line_user_id, is_friend, changed_at)`，等登入後合併。
     - `message`（文字）→ 寫入 `line_inbox(id, line_user_id, user_id null, text, received_at, handled_at, task_id)`，並開任務「家長訊息待回覆」給 staff。是否自動分類屬於 A5，留到第三階段。
     - `postback` → 依 `data` 交給對應的處理函式，例如 PR-18 的召集回覆。
   - 用 `webhookEventId` 去重（LINE 可能重送）。
2. `line_inbox` 只有 admin 能讀；保留 180 天後清除，由 pg_cron 執行。

**App：**
- `app/api/line/webhook/route.ts`：
  - 用 Channel secret 驗證 `x-line-signature`（HMAC-SHA256）。不通過 → 401。
  - 通過後把事件陣列轉給 `line_ingest_events`。用 anon client 呼叫，附上 ingest secret（Vercel server env）。
  - 在 1 秒內回應 200。不即時回覆家長；需要回覆的事由工作人員處理。
- 後台「LINE 收件匣」：列出還沒處理的訊息，標記「已處理」後關閉任務。回覆仍然在 LINE OA Manager 進行，系統不代發。

**驗收：**
- P15-1 簽章錯誤 → 401，資料庫沒有寫入。
- P15-2 封鎖或解除封鎖 → `is_friend` 跟著變；PR-14 對被封鎖的人改為 `skipped`。
- P15-3 家長傳文字 → 收件匣與任務各出現一筆；同一個事件重送不會重複。
- P15-4 `line_ingest_events` 用錯的 secret → 拒絕；anon 直接呼叫其他 RPC 仍然被 RLS 矩陣擋下。

---

## PR-16 AI 翻譯、用語表、公告擬稿與分眾群發（A1、A2、A6）

**DB：**
1. `glossary(id, zh_hant, ja, en, note, updated_by, updated_at)`：用語對照表，例如 梯隊＝育成クラス、堂數＝回数券。由工作人員維護。
2. `translations(id, source_kind, source_id, source_lang, target_lang, text, model, needs_review boolean, review_reason text, reviewed_by, reviewed_at, ai_job_id)`。
3. `announcements(id, title, audience jsonb, body_by_locale jsonb, status text check in ('draft','approved','sent','cancelled'), urgent boolean, ai_job_id, approved_by, sent_at)`：
   - `audience` 可以是梯隊、隊伍、場次報名者、全部家長。
   - 送出時依收件人展開成 `notifications`（kind `announcement`），沿用 PR-14 的批次與用量控制。
4. `ai_jobs.kind` 新增 `translate`、`announcement_draft`。

**AI（server only，沿用 PR-09 的 `ai_jobs` 紀錄方式）：**
- **翻譯（A1、A6）**：
  - 輸入：原文、來源語言、目標語言、用語表。
  - 輸出：結構化結果 `{text, needs_review, reason}`。內容涉及**金錢、傷病、時間變更**時，`needs_review` 必須為 true。
  - 系統提示與用語表放在最前面，並開啟 prompt caching。
- **公告擬稿（A2）**：
  - 工作人員輸入一句中文，並選擇場次或賽事（帶入日期、時間、地點）→ 產生三語稿。
  - 稿件一律是 `draft`，人確認後才送。
- 錯誤或拒答 → 退回人工輸入，不擋流程。模型、結構化輸出、fallback 的做法同 PR-09。

**App：**
- 後台「公告」頁：輸入一句話 → AI 三語稿 → 工作人員逐語修改 → 選擇對象（預覽人數與預估則數）→ 確認送出。也可以「複製」三語文字貼到 LINE 群組（並行期間的現行做法）。
- 評估（現有 assessments）：
  - 教練用日文或中文寫評語，存檔時自動翻譯成家長的語言。
  - `needs_review` 的翻譯先進工作清單，香織確認後家長才看得到。
  - 家長看到翻譯，可以展開原文。
- 後台「用語表」頁。

**驗收：**
- P16-1 公告草稿在確認前不會送出；確認後依對象展開成通知，人數與預覽一致。
- P16-2 評語含「受傷」→ 翻譯 `needs_review`，香織確認前家長看不到。
- P16-3 用語表新增「梯隊＝育成クラス」→ 下一次翻譯採用（以假的 AI 回應測組 prompt 的函式）。
- P16-4 沒有設定 API key → 公告改為手動輸入三語，評估不翻譯但照常存檔。

---

## PR-17 繳費 AI：截圖擷取（A3）與匯款回報文字解析（A8）

**AI：**
- **A3**：家長在繳費回報上傳轉帳截圖 → AI 擷取 `{amount_twd, last5, transfer_date, bank}` → **預填**表單，家長確認後送出。
  - 截圖仍存進 `payment-proofs`（第一階段）。
  - 擷取結果存在 `payment_claims.extracted`，讓審核頁同時顯示家長填的值和 AI 讀到的值；兩者不一致時標黃。
- **A8**（並行期間）：
  - 家長在 LINE 對話裡貼上現行的匯款回報範本（中文或日文）→ PR-15 收件匣收到 → AI 解析成 `{日期, 孩子姓名, 梯隊, 方式, 金額, 用途, 末五碼或收款教練, 是否需要發票, 統編}`。
  - 系統依姓名比對傳訊的家長名下的孩子 → 建立**草稿**繳費回報，並開任務給香織確認。對不到孩子或欄位不完整時，只開任務、不建草稿。
  - 家長還沒綁 LINE 或還沒綁孩子 → 只開任務，附上原文。

**DB：**
1. `payment_claims` 新增 `extracted jsonb`、`source text check in ('form','line_text') default 'form'`、`draft boolean default false`（草稿不出現在家長端，也不算未完成的申報）。
2. RPC `staff_confirm_claim_draft(claim_id, fields jsonb)`：香織修正欄位後轉成正式的待審申報，再走第一階段的核准流程。

**驗收：**
- P17-1 合成截圖（不可用真實截圖）→ 金額、末五碼、日期預填；家長可以修改。
- P17-2 審核頁同時顯示家長填的值和 AI 值，不一致時標黃。
- P17-3 合成的匯款回報文字（中文與日文各一）→ 產生草稿與任務；香織確認後成為待審申報。
- P17-4 AI 失敗 → 表單照常可以手動填寫；收件匣的訊息仍然有任務。

---

## PR-18 賽事召集流程與帶隊教練 `match_staff`

**依據：** 藍圖 §3.5 的第 2～4 步、§3.11；D2、D2-1。

**DB：**
1. `training_sessions` 新增 `callup_deadline timestamptz`、`callup_sent_at`、`roster_confirmed_at`。
2. `session_registrations.status` 新增 `declined`：家長明確回覆「不參加」，與「未回覆」區分。新的 enum 值放在獨立的 migration。
3. `match_staff(session_id, coach_id, role text check in ('head','assistant'), assigned_by, assigned_at)`：
   - 取代以 `coach_team_assignments` 判斷某位教練是否帶某場比賽。
   - 教練能讀「自己帶隊的場次」的名單。
4. 成人隊衝突檢查：`players` 新增 `self_user_id uuid null`（成人隊球員本人的帳號，由 admin 設定）。指派帶隊教練時，如果這位教練的 profile 在同一天有成人隊比賽 → 回傳警告（不阻擋）。
5. RPC：
   - `admin_send_callup(session_id, deadline)`：對該隊伍有效名單的家長 enqueue `callup`。內容是 Flex 卡片，有「參加」「不參加」兩個 postback 按鈕，加上「詳情」LIFF 連結。
   - `respond_callup(session_id, player_id, attending boolean)`：家長在 LIFF 回覆；PR-15 的 postback 也呼叫同一個函式。截止後回覆 → 拒絕，請聯繫香織。
   - `callup_sweep()`（pg_cron 每 15 分鐘）：
     - 截止前 24 小時，對未回覆的家長 enqueue `callup.reminder`，只發一次。
     - 截止後，開任務「U10 尚有 N 人未回覆」給 staff。
     - 截止後，開任務「名單待確認」給帶隊教練（沒有帶隊教練時給 staff）。
   - `confirm_match_roster(session_id, player_ids uuid[])`：帶隊教練或 staff 確認名單 → 寫入 `roster_confirmed_at`，對入選與未入選的家長 enqueue `roster.confirmed`。
6. 扣堂規則不變（D2、D2-1）：定名單後才取消 → 依 24 小時規則處理。

**App：**
- 後台場次頁（比賽）新增「召集」區塊：設定截止時間 → 預覽對象 → 送出。另有回覆統計（參加、不參加、未回覆）以及未回覆名單。
- 家長 LIFF：召集詳情頁（日期、集合時間、地點、費用），參加與不參加按鈕。
- 帶隊教練 LIFF（或 Web）：建議名單（參加者）→ 勾選確認。
- 後台指派帶隊教練，顯示衝突警告。

**驗收：**
- P18-1 送出召集 → 家長收到卡片；按「參加」→ 報名紀錄出現；按「不參加」→ 狀態為 `declined`。
- P18-2 截止前 24 小時，只有未回覆者收到提醒，而且只收到一次。
- P18-3 截止後出現兩個任務：「尚有 N 人未回覆」與「名單待確認」。
- P18-4 教練只看得到自己帶隊的場次名單；其他場次被 RLS 擋下。
- P18-5 指派的教練當天有成人隊比賽 → 顯示警告，但仍可以儲存。

---

## PR-19 教練 LIFF：我的行程、比賽日、訓練指引；緊急聯絡與過敏

**DB：**
1. `player_care(player_id pk, emergency_contacts jsonb, allergies text, medical_notes text, updated_by, updated_at)`：
   - 由家長在 LIFF 填寫，或由 admin 代填。
   - **讀取權限（D28）**：該孩子的家長、admin，以及**比賽當天**（台北日期等於場次日期）該場 `match_staff` 的教練。
   - 用 security definer 函式 `coach_match_care(session_id)` 回傳，不開放直接 select。
   - 教練每次讀取都寫入 `audit_log`（`care.viewed`）。
2. `training_guides(id, player_id, focus text, drills text, video_url null, next_review_on date null, source_lang, author_coach_id, status text check in ('draft','published'), translations via PR-16, created_at)`：
   - 教練寫，可以一次給個人或一組球員。
   - 內容涉及傷病（翻譯 `needs_review`）時，必須經香織確認才發布。
3. 「給工作人員」：`coach_messages(id, coach_id, body, source_lang, translated jsonb, status, created_at)` → 翻譯後開任務給 staff。是否對外發布由工作人員決定（藍圖 §2.2）。

**App（教練 LIFF）：**
- 我的行程：指派的梯隊訓練加上帶隊的比賽。如果教練也是成人隊球員（`self_user_id`），把成人隊的比賽一起列出。
- 比賽日：名單、背號、集合資訊；當天才顯示緊急聯絡與過敏；賽後筆記（選填，翻譯後併入評估）。
- 球員評估：沿用現有頁面，加上翻譯（PR-16）。
- 訓練指引：撰寫與發布。家長端在孩子頁面的評估旁邊看到「下一步」。

**驗收：**
- P19-1 帶隊教練在比賽當天看得到該場球員的緊急聯絡與過敏；前一天或隔天看不到；非帶隊教練任何時候都看不到。每次讀取都有稽核紀錄。
- P19-2 家長可以編輯自己孩子的緊急聯絡與過敏，看不到別人孩子的資料。
- P19-3 教練用日文寫訓練指引 → 家長看到自己語言的版本；含傷病內容時，香織確認前家長看不到。
- P19-4 「給工作人員」→ 出現翻譯後的任務，不會自動對外發送。

---

## PR-20 ICS 行事曆訂閱

**DB：**
1. `calendar_feeds(id, token text unique, owner_user_id null, scope text check in ('family','coach','team_public'), team_id null, revoked_at, created_at, last_fetched_at)`。token 至少 32 字元，可以撤銷並重發。
2. RPC `calendar_feed_events(p_token text)`：security definer，anon 可以執行，但必須有有效的 token。回傳內容依 scope：
   - `family`：名下所有孩子的梯隊與隊伍場次（含跨上），不含其他孩子的資料。
   - `coach`：指派的隊伍場次，加上帶隊比賽。
   - `team_public`：只回傳已發布的比賽，不含任何個資。
   - 時間範圍：過去 30 天到未來 180 天。

**App：**
- `app/api/cal/[token]/route.ts`：
  - 呼叫 RPC → 用擴充後的 `lib/org/calendar-export.ts` 產生多事件的 VCALENDAR（含 `UID`、`SEQUENCE`，取消的場次標記 `STATUS:CANCELLED`）。
  - `Cache-Control: private, max-age=900`。
- 家長「設定」頁與 LIFF：「加入 Google 行事曆」（轉成 Google 的訂閱網址）、「加入 Apple 行事曆」（`webcal://`），以及撤銷重發按鈕。
- 提示文字：Google 可能數小時才更新一次，**臨時異動以 LINE 通知為準**（藍圖 §2.4）。

**驗收：**
- P20-1 家長的 feed 只包含自己孩子的場次；撤銷後的 token 回傳 404。
- P20-2 公開梯隊的 feed 不含任何名字或個資。
- P20-3 取消的場次在 feed 中標記 `CANCELLED`。
- P20-4 產生的 `.ics` 通過格式驗證（單元測試）。

---

## PR-21 官網 CMS、體驗課預約、SEO

**DB：**
1. `site_posts`、`site_coaches`、`site_programs`、`site_settings`：三語欄位（zh-Hant 必填，ja、en 可空，空的時候退回繁中）、發布狀態。只有 admin 能寫；已發布的內容 anon 可以讀。
2. `leads(id, child_birth_year, preferred_slot, parent_name, contact_line null, contact_phone null, note, locale, status text check in ('new','contacted','trial','joined','lost'), source, created_at, updated_at)`：
   - anon 只能透過 RPC `submit_trial_request(...)` 新增。
   - 防濫用（D26）：隱藏欄位、同一 IP 雜湊每小時最多 3 筆、內容長度限制。
   - 新增時開任務「新潛在學員」給 staff。
   - `joined` 時可以一鍵轉成球員（帶入出生年；正式資料由工作人員補齊）。
3. 照片放在公開 bucket `site-media`：只有 admin 能上傳；**不放孩子的照片**，除非該孩子有肖像同意（PR-11）。

**App：**
- 首頁、最新消息、教練團、課程與費用、聯絡等區塊，改為讀取 CMS。
  - 用 ISR，存檔時以 tag 讓快取失效。
  - 首頁維持靜態：登入按鈕改成 client 小元件（藍圖 §2.1）。
- 體驗課預約表單：成功後顯示「加入 LINE 好友」按鈕（官方帳號連結放在 `site_settings`）。
- SEO：`sitemap.ts`、`robots.ts`、結構化資料（`SportsTeam`、`SportsEvent`）。
- 後台：CMS 編輯（可以用 PR-16 的 AI 擬三語稿）、潛在學員看板。

**驗收：**
- P21-1 發布一則消息 → 三語頁面在 1 分鐘內更新；只填繁中時，日文頁顯示繁中。
- P21-2 體驗課表單送出 → 後台出現潛在學員與任務；同一個 IP 第 4 筆被擋。
- P21-3 潛在學員轉成球員後，狀態變成 `joined`，並連結到新建的球員資料。
- P21-4 首頁仍然是靜態產生（build 輸出顯示 ○ 或 ISR）。

---

## PR-22 扣堂規則表 `debit_policies`

**DB：**
1. `debit_policies(id, session_kind, age_scope text, attend_credits int, late_cancel_credits int, no_show_credits int, late_cancel_window_hours int default 24, one_per_match_day boolean, effective_from date, created_by, created_at)`。
   - 種子資料等於目前的規則：例行 −1／0、特殊 −2（臨時取消也是 −2）、賽事一日 −1。
2. `compute_session_debit_plan` 改為讀取「場次日期當時有效」的那一列規則。
3. 已經扣過的紀錄不回溯；新規則只影響生效日之後的場次。
4. 後台編輯：只能新增「未來生效」的規則，不能修改已經生效的規則。

**驗收：**
- P22-1 `lib/credits/debit-rules.fixtures.json` 的所有案例，在 TS 和 SQL 的結果仍然一致（沿用第一階段的雙邊 fixture 測試）。
- P22-2 新增一條下個月生效的規則 → 本月場次照舊，下個月場次套用新規則。
- P22-3 已生效的規則無法修改。

---

## PR-23 季度、在籍與換季工具

**DB：**
1. `seasons(id, label, starts_on, ends_on)`：每年 8/15 起算，與 `lib/age-band.ts` 的 `getSeasonStart` 一致。
2. `enrollments(player_id, season_id, status text check in ('trial','active','paused','left'), changed_at, changed_by)`：以目前的 `players.status` 回填本季資料。
3. RPC `admin_preview_season_rollover(target_season)`：依新季度的年齡重新計算每位球員的梯隊，列出「升組、留組（`continues_training`）、需要人工判斷」三類。
4. RPC `admin_apply_season_rollover(target_season, overrides jsonb)`：
   - 在一個交易內更新主梯隊（保留跨上，除非跨上的梯隊等於新的主梯隊）、背號沿用，並建立新季度的 enrollment。
   - 寫入稽核紀錄。
   - 可以重複執行：已經套用的球員跳過。

**App：**
- 後台「換季」頁：先看預覽（可以逐列覆寫），確認後執行；顯示結果摘要。
- 換季前 2 週開任務「換季升組」給 admin（藍圖 §3.8 的 8/1）。

**驗收：**
- P23-1 預覽與實際套用的結果一致；覆寫的列依覆寫內容處理。
- P23-2 重複執行不會重複升組。
- P23-3 主梯隊升組後，價格依新的主梯隊計算（D10-1）。

---

## 11. Victor 需要在後台完成的設定（第二批開始前）

這些不能交給 agent。順序很重要：

1. **選定 Provider（D18，建立後無法更改）。** 在 LINE Official Account Manager 為**現有的官方帳號**啟用 Messaging API。這時要選擇或建立 Provider，建議用球團正式名稱。**這個選擇之後不能改**，後面所有 channel 都必須放在這個 Provider 下面。
2. 在同一個 Provider 下面建立 **LINE Login channel**：
   - 新增 LIFF App，端點填 production 網址的 `/liff`。
   - 在「Linked LINE Official Account」選擇球團的官方帳號。
3. **測試環境（D17）：** 另外建立一個**測試用 Provider**，底下放測試用的官方帳號、Messaging API channel、LINE Login channel 和 LIFF。只加工作人員與 Victor 為好友。**staging 只接這一組。**
4. 申請認證帳號（D15），並查詢目前的訊息方案與價格（D5），決定每月則數上限（D22）。
5. Supabase（staging）：
   - Authentication → 新增自訂 OIDC Provider「LINE」（設定值由 PR-12 提供）。
   - 啟用手動帳號連結。
   - Vault 新增 `line_channel_access_token` 與 `line_ingest_secret`。
6. Vercel（staging）：設定 `LINE_CHANNEL_SECRET`、`LINE_INGEST_SECRET`、`NEXT_PUBLIC_LIFF_ID`；`ANTHROPIC_API_KEY` 在 PR-09 已經需要。
7. 執行 `scripts/line-richmenu.ts`（PR-13），建立各角色的選單。

agent 會在每個 PR 描述中列出該 PR 需要的設定，**但不會經手任何密鑰**。

---

## 12. 待決定事項（請審核）

| # | 問題 | 建議 | 影響 |
| --- | --- | --- | --- |
| D16 | 背景推播與 Webhook 用什麼權限執行？ | **資料庫端執行**（pg_cron＋pg_net＋Vault），App 不放 service role key；Webhook 與 ICS 用 token 或密鑰呼叫 security definer RPC。替代方案是在 Vercel server 放 service role key：較簡單，但只要一個 bug 就繞過全部 RLS | PR-12、14、15、20 |
| D17 | staging 是否用獨立的 LINE 測試 Provider 與測試官方帳號？ | **是**。避免測試推播送到真實家長 | PR-12 起 |
| D18 | Messaging API 掛在哪一個 Provider？ | 用球團正式名稱新建或選定，建立後不能更改；LINE Login 必須放在同一個 Provider | 第 11 節 |
| D19 | 邀請碼怎麼發給家長？ | **工作人員在球場發列印小卡**（含 QR），也可以由香織在 LINE 個別傳。全部轉成小卡格式，方便兩種方式都能用 | PR-10 |
| D20 | 開放搜尋綁定是否關閉？ | **關閉家長端搜尋**；管理員手動建立連結保留給特殊狀況 | PR-10 |
| D21 | 推播靜音時段 | **21:30–07:30 不推播**，延到早上；停課等緊急公告例外 | PR-14 |
| D22 | 每月推播則數上限 | 依 D5 查到的方案設定；80% 提醒，100% 只送緊急類別 | PR-14 |
| D24 | 同意項目與文案 | 四項：個資告知（必要）、肖像使用（選擇性）、證件用於賽會報名（選擇性）、購買條款「未使用完不退費」（購買時必要）。**文案由球團提供**；「不退費」是否符合預付型服務規定，請在上線前確認（藍圖 §3.4） | PR-11 |
| D25 | 召集回覆方式 | **LINE 卡片上的「參加／不參加」按鈕直接回覆**，另附 LIFF 詳情頁；不需要開網頁也能回覆 | PR-18 |
| D26 | 體驗課表單防濫用 | 先用隱藏欄位＋每小時限次，不接第三方驗證；真的有垃圾表單再加 Cloudflare Turnstile | PR-21 |
| D27 | AI 翻譯什麼時候可以不經人確認就送出？ | 個人評估與訓練指引：沒有旗標就直接給家長看，有旗標（金錢、傷病、時間變更）先確認；**群發公告一律人確認** | PR-16 |
| D28 | 緊急聯絡與過敏的可見範圍 | 只在**比賽當天**開放給該場帶隊教練（藍圖 §3.11）。要不要擴大到例行訓練的梯隊教練？建議先不要，有實際需求再開 | PR-19 |

（D23 保留：SMS OTP 繼續保留給管理員與沒有 LINE 的人，藍圖已決議，不需要再決定。）
