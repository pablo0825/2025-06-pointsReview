# 實作時確認項目

第一版正式設計已收斂。本文件保留實作時仍需選型、設定或與前端／部署環境確認的項目；這些項目不阻塞第一版資料模型、API、Transaction、Storage、Testing 等設計。

若某項目升級為會影響資料模型、API contract 或流程語意的設計變更，應移至對應正式文件更新。

## 實作時確認項目

### 1. Email Queue 與通知排程

Email Queue 與通知排程初版已整理於 [Email Queue 與通知排程](email-queue.md)。

目前已確認：

- 第一版使用 `email_tasks` 作為通用寄信任務佇列，任務狀態為 `pending`、`processing`、`sent`、`failed`、`cancelled`。
- 使用 `event_key` 防止重複建立同一通知。
- 使用 `attempt_count` 與 `max_attempts` 記錄並限制最大嘗試寄送次數。
- `email_tasks` 保存收件人、模板名稱、模板資料、排程時間、成功時間、嘗試次數與最近一次錯誤。
- 寄送失敗使用有限次數重試；第一版預設 `max_attempts = 5`。
- Worker 使用 `FOR UPDATE SKIP LOCKED` claim pending tasks。
- Service 與 worker 依賴 `EmailProvider` interface；Phase 4.2 使用 fake provider 測試，實際服務以 adapter 接入，不修改 queue 與 retry 核心流程。
- Phase 4.2 完成單次 worker、正常寄送與有限重試；永久失敗通知、stale processing maintenance 與正式 worker lifecycle 留在 Phase 10。
- 老師簽核提醒第一版排程為期限前 `72` 小時、`24` 小時與 `4` 小時。
- 補件提醒第一版排程為期限前 `24` 小時。
- 第一版在 Phase 10 補上寄送永久失敗時建立 `email_delivery_failed` 通知，並避免失敗通知無限遞迴。
- Email 寄送失敗本身不應直接讓申請作廢。
- Email task 管理查詢與系統內手動重寄延後到第二版；Phase 4.2 完成自動有限重試與永久失敗狀態，第一版 Phase 10 再完成失敗通知與 worker 維運整合。
- `advisor_confirmation_expires_at` 是指導老師簽核最後期限；提醒信必須在期限前寄送，逾期後不再自動寄送簽核連結。

仍需實作時確認：

- Email provider，例如 SMTP、SendGrid、Mailgun 或學校信件服務。
- 寄件者名稱、reply-to 與 provider message id 是否保存。
- Email template 實際 subject 與 HTML/text 內容。
- 第二版管理後台 failed email tasks 列表欄位、操作文案與手動重寄確認流程。

### 2. 通知失敗與申請作廢政策

通知失敗與申請作廢政策已併入 [Email Queue 與通知排程](email-queue.md#通知失敗與申請作廢政策)。

目前已確認：

- 系統應區分「使用者收到通知但未處理」與「系統無法成功寄送通知」。
- Email 永久失敗時，通知管理員處理，不應直接將申請作廢。
- Email 失敗不會自動延長 `advisor_confirmation_expires_at` 或 `edit_token_expires_at`。
- 已正常通知但逾期未處理的申請，作廢後不可恢復。
- 指導老師逾期未簽核時，系統將申請設為 `rejected`，寫入 `advisor_confirmation_expired` 審核操作紀錄，並寄送作廢通知給申請人。
- 第一版支援承辦人延長補件期限；只能延長仍在 `needs_revision` 且補件 Token 有效的申請，不可復原已作廢申請。
- 第一版不實作指導老師簽核期限延長；若未來需要，應另行定義權限、通知與審核紀錄。

仍需實作時確認：

- 第二版管理後台人工處理 Email 永久失敗的畫面與流程。
- 因 Email 無法寄達造成特殊處理時，是否需要額外審核紀錄 action type。

### 3. Migration 與初始資料 Seed

Migration 與 Seed 初版方案已整理於 [Migration 與 Seed 方案](migration-plan.md)。

目前已確認：

- 第一版建議使用 `node-pg-migrate`。
- Migration 以 raw SQL 為主，從 [資料庫 Schema](database-schema.md) 轉換。
- Migration 依資料表外鍵與循環外鍵順序拆分，`point_applications.current_version_id` 複合外鍵使用後置 `ALTER TABLE` 建立。
- Seed 與 Migration 分開管理，避免正式環境誤寫入展示資料。
- 固定代碼如 `advisors.title_code`、`grade` 與 `class_number` 第一版不建立 seed table，由程式常數或 enum 對照表維護。
- 初始管理員不寫入 schema migration，改由受控維運指令建立。
- 正式環境以 forward migration 修正為主，不依賴自動 down migration 回滾。
- Migration 檔名採 `YYYYMMDDNNNN_description.sql`，例如 `202607110001_create_users.sql`。
- Migration 目錄為 `migrations/`，migration table 使用 `node-pg-migrate` 預設 `pgmigrations`，migration language 使用 SQL。
- Migration npm scripts 需提供 create、up、down 與 status；資料庫連線透過 `DATABASE_URL` 環境變數提供。

仍需實作時確認：

- 開發與測試環境 seed 的資料量與展示案例。

### 4. API Endpoint 與 Service 邊界

API Endpoint 與 Service 邊界初版已整理於 [API 與 Service 邊界](api-service-boundaries.md)。

目前已確認：

- Controller 只處理 HTTP 輸入輸出。
- Service 執行業務規則與 Transaction。
- Repository 集中管理 SQL 查詢。
- 公開、指導老師、承辦人、管理員、私有檔案與 Auth API 已完成第一版分組。
- API 文件已標示主要權限、Service function 與是否需要 Transaction。
- API request / response schema、分頁、錯誤碼與私有檔案 header 已整理於 [API Request / Response Schema](api-schemas.md)。
- 已定義 `public_id` 的資源，API URL 使用 `public_id`，不暴露內部 `BIGINT id`；未定義 `public_id` 的後台管理資源第一版可使用內部 id。
- List API 必須使用分頁。

仍需實作時確認：

- 是否將 [API Request / Response Schema](api-schemas.md) 轉為正式 OpenAPI 規格。
- 前端是否需要更細的欄位級錯誤代碼或顯示文字。
- Auth API 需依 [登入、Session 與安全設計](auth-session-security.md) 實作 session、cookie、CSRF 與 rate limit。
- Multipart 檔案欄位命名可依前端表單實作再做微調。

### 5. Transaction 與併發控制

Transaction 與併發控制初版已整理於 [Transaction 與併發控制](transaction-concurrency.md)。

目前已確認：

- Transaction 由 Service 控制，Controller 不直接處理 Transaction。
- Repository function 必須可接收一般 database client 或 transaction client。
- 申請狀態轉換與最終審核操作使用 `point_applications FOR UPDATE`。
- Email tasks 與主流程狀態變更在同一個 Transaction 中建立，實際寄送由 worker 在 commit 後處理。
- 證照累積上限第一版使用 PostgreSQL advisory transaction lock，以 `pg_advisory_xact_lock(hashtext('certificate-points:' || student_number)::bigint)` 作為鎖定 key。
- 背景逾期作廢任務必須使用與人工操作相同的鎖定與狀態重驗策略。
- 第一版不建立通用 `Idempotency-Key` 機制，先依狀態檢查、資料列鎖、unique constraint、token 清除與 `event_key` 處理重複提交。

仍需實作時確認：

- 各 Service 對資料庫 constraint error 的錯誤碼轉換。

### 6. 登入、Session 與安全

登入、Session 與安全初版已整理於 [登入、Session 與安全設計](auth-session-security.md)。

目前已確認：

- 第一版採 server-side session + `HttpOnly` cookie，不採無狀態 JWT 作為主要登入 session。
- Cookie 設定使用 `HttpOnly = true`、正式環境 `Secure = true`、`SameSite = Lax`。
- Session 閒置有效期限建議 `8` 小時，絕對有效期限建議 `7` 天。
- 登出、帳號停用、密碼重設、角色變更、管理員移交與管理員復原都必須撤銷相關 session。
- 帳號啟用 token 有效期限建議 `24` 小時；密碼重設 token 有效期限建議 `30` 分鐘。
- 密碼長度至少 `12` 字元，密碼雜湊使用 Argon2id；第一版參數為 `memoryCost = 65536 KiB`、`timeCost = 3`、`parallelism = 1`。
- 使用 cookie session 的 state-changing API 必須有 CSRF 防護。
- CSRF token 綁定 `user_sessions`，資料庫只保存 `csrf_token_hash`；前端透過 `GET /auth/csrf-token` 取得，並以 `X-CSRF-Token` header 帶回。
- 第一版不開放任意 CORS；正式環境 CORS allowlist 必須明確設定。
- 登入、密碼重設、公開申請、補件與公開學生點數查詢都需要 rate limit。
- 第一版正式環境使用 Redis-backed rate limit；local development 與單元測試可使用 in-memory store。
- Log 與錯誤訊息不得輸出密碼、原始 token、token hash、session token、CSRF token、SQL error 原文或 stack trace。

仍需實作時確認：

- Redis rate limit key 命名、window 設定與 middleware 套件。
- Session cookie 名稱與 domain。

### 建議確認順序

1. Email Queue 與通知排程。
2. 通知失敗與申請作廢政策。
3. Migration 與初始資料 Seed。
4. API Endpoint 與 Service 邊界。
5. Transaction 與併發控制。
6. 登入、Session 與安全。
