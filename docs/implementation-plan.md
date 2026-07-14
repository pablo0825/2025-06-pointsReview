# 第一版實作計劃

本文件整理第一版後端實作順序與可追蹤 checklist。實作方向是在現有 Express 專案內逐步切換到 PostgreSQL / `pg`，不再延伸 MongoDB / Mongoose 的資料模型。產品流程、資料模型、API contract、Transaction 與測試細節仍以本目錄其他正式設計文件為準。

## 實作原則

- 從現有專案漸進改造，不另開新 backend skeleton。
- 第一版資料庫以 PostgreSQL 為主，MongoDB 舊路徑只作為過渡參考，不新增功能。
- Controller 只處理 HTTP 輸入輸出；Service 處理業務規則、Transaction 與狀態轉換；Repository 集中管理 SQL。
- 每個需要 Transaction 的 Service 必須使用同一個 transaction client 呼叫多個 Repository。
- 先讓 migration、schema 與核心資料流穩定，再擴展背景任務與管理功能。
- 每個階段至少保留可手動驗證或自動測試的完成條件。
- 測試隨功能所在 Phase 一起完成；Phase 10 只補跨模組回歸、併發與 CI 收斂，不把前面所有測試延後到最後。
- Checklist 的 `[x]` 代表程式、必要安全控制與該階段驗證均已完成；只有完成設計評估時，必須明確標示為「評估 Checklist」。

## Phase 0：專案基礎整理

目標：確認現有專案可承接 PostgreSQL 架構，並降低 Mongo 舊程式對新實作的干擾。

### 現況評估

目前專案已經有 Express、routes、controllers、middlewares、Mongoose models、Email templates、jobs 與 tasks。第一版 PostgreSQL 實作應在現有專案中建立新的資料層與 Service 分層，不建議直接在既有 Mongo/Mongoose models 上修改。

可沿用或參考：

- Express app 啟動與 route 註冊模式可沿用，但需要調整啟動時的資料庫與 job 邊界。
- `asyncHandler` 可沿用，作為 async controller 錯誤轉交 middleware。
- 現有 React Email templates 與 render helper 可作為 email template 實作參考。
- 現有 upload middleware 的檔案大小與副檔名限制可參考，但不能直接作為第一版私有檔案儲存實作。
- TypeScript 設定可先沿用，目前 `strict: true` 有助於後續重構。

不建議沿用：

- 現有 auth middleware 使用 JWT access/refresh token，與第一版 server-side session + HttpOnly cookie 設計不一致，應重做。
- 現有角色值為 `handle`、`admin`、`director`、`noRole`，與第一版 `advisor`、`reviewer`、`admin` 不一致，不能直接沿用。
- 現有 Mongo/Mongoose models 不應作為新資料模型來源；新資料模型以 `docs/data-model.md` 與 `docs/database-schema.md` 為準。
- 現有 Email queue 在寄送失敗達上限時會直接終止申請，與第一版「Email 永久失敗不直接讓申請作廢」政策衝突，應重寫。
- 現有 `AppError`、success response 與 error response 格式和第一版 API contract 不一致，應重構或建立新錯誤處理格式。
- 現有 upload middleware 會用原始檔名組檔案路徑，與第一版 storage key 與私有儲存規則不一致，應重做 storage adapter。

建議新增的 PostgreSQL 實作目錄：

```text
src/config/
src/db/
src/repositories/
src/services/
src/schemas/
src/mappers/
```

建議新增或重做的 middleware：

```text
src/middlewares/session.middleware.ts
src/middlewares/csrf.middleware.ts
src/middlewares/permission.middleware.ts
src/middlewares/validateRequest.middleware.ts
```

`src/index.ts` 調整方向：

- 不應再以 MongoDB `DATABASE` / `DATABASE_PASSWORD` 作為新系統啟動硬前提。
- 不應在新 PostgreSQL 路線中強制要求 JWT secrets。
- PostgreSQL 連線應改由 `DATABASE_URL` 提供。
- 舊 Mongo jobs 不應在新 PostgreSQL 主流程啟動時自動執行。
- 舊 routes 可暫時保留，但新 routes 應依文件定義的 `/public`、`/auth`、`/advisor`、`/reviewer`、`/admin` 路徑逐步建立。

### 決策結論

- 舊 Mongo/Mongoose route 先保留但不新增功能。
- 新 PostgreSQL route 依文件定義的 `/public`、`/auth`、`/advisor`、`/reviewer`、`/admin` 路徑逐步建立，並與舊資料流隔離。
- PostgreSQL 主要連線設定使用 `DATABASE_URL`。
- `asyncHandler` 可沿用。
- error handler 需依第一版 API contract 重構。
- upload middleware 的大小與副檔名限制可參考，但 storage 與檔名策略需重做。
- `package.json` 保留既有啟動方式，並在 Phase 1 加入 migration scripts。

### 第一個實作 Commit 建議範圍

- 新增 PostgreSQL 依賴與 migration scripts。
- 建立 `src/db/pool.ts` 與 `src/db/transaction.ts`。
- 建立基礎 config 讀取與 `DATABASE_URL` 檢查。
- 調整 `index.ts`，讓 Mongo 連線與舊 jobs 不再阻擋 PostgreSQL-only 啟動。
- 建立第一批 migration 檔案骨架。

### 後續實作注意事項

- 現有 controller 中有讀取 `req.cookies` 的邏輯，但目前依賴清單尚未看到 `cookie-parser`；新 session 實作前應補上或明確選擇 cookie 解析方案。
- 開始改程式前建議先跑一次 `npm run build`，記錄既有 TypeScript 問題，避免後續混淆新舊錯誤來源。
- 若舊 API 仍需暫時可用，應以 route namespace 或啟動設定隔離新舊資料流，避免同一 endpoint 同時操作 Mongo 與 PostgreSQL。

### Phase 0 評估 Checklist

- [x] 盤點現有 `src/` 的 entrypoint、routes、middlewares、controllers、models 與 jobs。
- [x] 決定舊 Mongo/Mongoose route 先保留但不新增功能，新 PostgreSQL route 依文件定義路徑逐步建立並隔離資料流。
- [x] 新增 PostgreSQL 相關環境變數規劃，例如 `DATABASE_URL`。
- [x] 確認現有 error handler、async handler、upload middleware 可否沿用；結論是 `asyncHandler` 可沿用，error handler 與 upload/storage 需依新 API contract 重構。
- [x] 更新 `package.json` scripts 規劃，保留既有啟動方式並加入 migration scripts；實際修改 package scripts 併入 Phase 1 第一個實作 commit。

### Phase 0 實作 Checklist

以下項目是 PostgreSQL 新主流程的啟動前提。評估完成不代表這些改造已完成；在繼續擴充新 API 前應先補齊。過渡期仍需保留尚未替換的 MongoDB 舊 API，但必須用明確開關隔離，避免新 PostgreSQL 主流程被 MongoDB 啟動條件、舊 routes 或舊 jobs 綁住。

- [x] 將 Express app 組裝與程序啟動拆開，例如 `createApp()` / `startServer()`，讓 API test 載入 app 時不會自動 listen、建立外部連線或啟動 jobs。
- [x] 新 PostgreSQL 主流程只以 `DATABASE_URL` 作為資料庫啟動必要條件；未啟用 legacy Mongo 時，不要求 MongoDB `DATABASE` / `DATABASE_PASSWORD`。
- [x] 新 PostgreSQL 主流程不再強制要求舊 JWT access / refresh secrets。
- [x] 使用 `ENABLE_LEGACY_MONGO` 或等效明確開關隔離舊 Mongo routes、Mongo connection 與舊 jobs；預設啟動新主流程時不得自動載入。
- [x] 啟用 legacy Mongo 時，才掛載尚未替換的舊 API、建立 MongoDB connection、啟動舊 Mongo jobs，並要求必要的 MongoDB 環境變數。
- [x] 確認新舊 Auth route 不會在正式部署同時提供兩套不同登入機制。
- [x] 安裝並註冊 `cookie-parser`，供 server-side session cookie 使用。
- [x] 驗證只提供 `DATABASE_URL`、必要的 PostgreSQL 新系統設定，且未啟用 legacy Mongo 時，backend 可以成功啟動。

MongoDB 最終移除不屬於 Phase 0 完成前提。等所有舊 API 完成 PostgreSQL 替換後，再移除 Mongoose models、Mongo routes、Mongo jobs、`mongoose` 依賴與 MongoDB 專用環境變數。

完成條件：

- PostgreSQL 新主流程在未啟用 legacy Mongo 時，不載入 Mongo routes、不建立 Mongo connection、不啟動 Mongo jobs。
- 舊 Mongo API 可在明確啟用 legacy Mongo 時暫時提供，直到對應 PostgreSQL API 完成替換。
- PostgreSQL 新主流程不依賴 MongoDB、舊 JWT secrets 或舊 jobs 即可啟動。
- 測試載入 Express app 時不會產生 listen、外部連線或背景工作等副作用。

## Phase 1：資料庫與 Migration

目標：讓乾淨 PostgreSQL database 可以完整建立第一版 schema。

### 本機基礎服務準備

在開始安裝 PostgreSQL client、migration 工具與撰寫 schema 前，應先確認本機開發環境已有可連線的 PostgreSQL 與 Redis。第一版主要資料庫使用 PostgreSQL；Redis 預留給 session、CSRF、email queue 或背景任務等需要短期狀態與 queue 的功能。

本專案提供 `docker-compose.yml` 作為本機服務啟動方式：

- `pr_b_postgres`：PostgreSQL 16，供 `DATABASE_URL` 連線。
- `pr_b_redis`：Redis 7，供 `REDIS_URL` 連線。

本機主機端連線設定使用：

```text
DATABASE_URL=postgres://points_review:points_review_password@localhost:5432/points_review
REDIS_URL=redis://localhost:6379
```

若 backend 也在 Docker Compose 內執行，container 之間應使用 service name 連線：

```text
DATABASE_URL=postgres://points_review:points_review_password@pr_b_postgres:5432/points_review
REDIS_URL=redis://pr_b_redis:6379
```

服務啟動與健康檢查：

- [x] 使用 `docker compose up -d pr_b_postgres pr_b_redis` 啟動本機 PostgreSQL 與 Redis。
- [x] 使用 `docker compose ps` 確認兩個 container 狀態為 `Up`。
- [x] 使用 `psql` 對 `pr_b_postgres` 執行 `SELECT version();` 確認 PostgreSQL 可連線。
- [x] 使用 `redis-cli ping` 對 `pr_b_redis` 確認 Redis 回應 `PONG`。

完成本段後，才開始進行下列 Phase 1 實作項目。

- [x] 安裝並設定 `pg`。
- [x] 安裝並設定 `node-pg-migrate`。
- [x] 建立 `migrations/` 目錄。
- [x] 建立 migration npm scripts：
  - [x] `migrate:create`
  - [x] `migrate:up`
  - [x] `migrate:down`
  - [x] `migrate:status`，由專案腳本讀取 migration 檔案並查詢 `pgmigrations` 狀態。
- [x] 依 [Migration 與 Seed 方案](migration-plan.md) 建立 migration：
  - [x] extensions 與 `set_updated_at()` trigger function
  - [x] `users`
  - [x] `user_sessions`
  - [x] `audit_logs`
  - [x] `advisors`
  - [x] `application_type_participant_rules`
  - [x] `application_instructions`
  - [x] `point_applications`
  - [x] `email_tasks`
  - [x] `application_versions`
  - [x] `point_applications.current_version_id` 循環外鍵
  - [x] `application_participants`
  - [x] 四張點數規則表
  - [x] 四張申請類型專屬表
  - [x] `application_attachments`
  - [x] `application_review_actions`
  - [x] `advisor_signatures`
  - [x] `student_point_transactions`
  - [x] `student_point_change_requests`
  - [x] `student_points_summary` View
- [x] 建立 seed 執行方式。
- [x] 建立初始點數規則 seed。
- [x] 驗證乾淨資料庫可從第一個 migration 跑到最新版本。
  - 已使用暫時資料庫 `points_review_verify` 從空資料庫執行 `migrate:up`。
  - `migrate:status` 結果為 migration files 20、applied migrations 20、pending migrations 0。
  - 已執行 `seed:development`，確認初始人數規則與四類點數規則 seed 筆數符合文件。
  - 已確認 `student_points_summary` View 可查詢，且所有具有 `updated_at` 的實體表都有 `set_updated_at()` trigger。

完成條件：

- `migrate:up` 可在乾淨 PostgreSQL database 完整成功。
- `student_points_summary` View 可查詢。
- 所有具有 `updated_at` 的資料表都有 trigger。
- 已保留乾淨資料庫 migration 與 seed 的人工驗證紀錄；可重複執行的 migration verification command 延後到 Phase 10 / 部署前 CI 收斂時建立。

## Phase 2：共用後端骨架

目標：建立後續 Service 與 Repository 共同使用的技術基礎。

- [x] 建立 PostgreSQL pool module。
- [x] 不建立全域 query helper；Repository 統一接收 `DatabaseClient`。
- [x] 建立 transaction helper。
- [x] 建立 Repository function 接收一般 client 或 transaction client 的慣例，並以 `UserRepository` 作為最小範例。
- [x] 建立統一錯誤格式：
  - [x] `{ code, message }`
  - [x] Zod error `fields`
- [x] 建立 DB constraint error 轉換策略。
  - 目前先建立 PostgreSQL constraint error 的共用轉換 helper。
  - 已內建文件中已確認的共用 constraint mapping，例如 Email 重複、點數規則期間重疊、唯一啟用管理員與主任衝突。
  - 各 Service 的細部 constraint error mapping 仍依實作時的業務情境補上，不在此階段猜測。
  - 第一版不保留舊 `AppError` / legacy error 的相容轉換層；新 PostgreSQL API 應統一使用 `ApiError`、`ZodError` 或 PostgreSQL constraint error mapping。
- [x] 建立 Zod validation middleware：
  - [x] params
  - [x] query
  - [x] body
- [x] 建立 request context helper：
  - [x] ip address
  - [x] user agent
  - [x] current user
- [x] 建立測試基礎：
  - [x] 選定並設定 test runner。
  - [x] 建立獨立 PostgreSQL test database 設定與防止連到 production 的檢查。
  - [x] 建立 repository / service transaction rollback test helper。
  - [x] 建立 API test 可直接載入的 Express app。
- [x] 建立最小應用程式啟動檢查：
  - [x] 啟動時驗證 PostgreSQL 可連線。
  - 備註：完整 graceful shutdown、worker lifecycle 與 health / readiness endpoint 延後到 Phase 10 / 部署前處理，避免在 Redis、Email worker 與 legacy Mongo 策略未穩定前過早實作。
- [x] 建立 HTTP 安全邊界：
  - [x] JSON / URL-encoded request body 大小限制。
  - [x] 建立統一 client IP helper；目前不直接信任任意來源的 `X-Forwarded-For`，正式 reverse proxy 與 `trust proxy` 設定延後到 Phase 10。
  - [x] Log 遮罩密碼、原始 token、token hash、session token、CSRF token 與 SQL error 原文。
- [x] 補共用骨架測試：
  - [x] transaction callback 成功時 commit、失敗時 rollback。
  - [x] Zod params / query / body 驗證與 `validation_failed` response。
  - [x] 已映射與未映射 PostgreSQL constraint error。
  - [x] request context 在直連情境取得正確 IP，且不直接信任外部偽造的 `X-Forwarded-For`。

完成條件：

- 新 route 可使用 PostgreSQL query 與 transaction helper。
- Zod 驗證錯誤可回傳文件定義的 `validation_failed` 格式。
- Express app 可在測試中載入且不自動啟動外部副作用。
- 共用 transaction、validation、error mapping 與 request context 具有自動化測試。
- Body limit、client IP helper 與敏感 log 政策有明確設定；正式環境 CORS 與 reverse proxy 設定延後到 Phase 10 / 部署前處理。

## Phase 3：Auth / Session / 權限

目標：完成登入後 API 的基礎身分驗證與授權。

- [x] 實作密碼雜湊策略，使用 Argon2id。
- [x] 建立 `UserRepository`。
  - [x] 建立 `findById`、`findByEmail`、`updateLastLoginAt`，供 Auth Service 與後續使用者管理功能沿用。
- [x] 建立 `SessionRepository`。
  - [x] 建立 session / CSRF token helper，使用 32 bytes random 並以 base64url 表示原始 token。
  - [x] 建立 SHA-256 token hash helper，資料庫只保存 hash。
  - [x] 建立 session 建立、查詢有效 session、更新 last seen、撤銷單一 session、撤銷使用者所有 session 的 repository function。
- [x] 實作 `POST /auth/login`。
- [x] 實作 `POST /auth/logout`。
- [x] 實作 `GET /auth/me`。
- [x] 實作 `GET /auth/csrf-token`。
- [x] 實作 authentication middleware。
- [x] 實作 CSRF middleware。
- [x] 實作 `Permission` 型別與 `rolePermissions` mapping。
- [x] 實作 permission middleware。
- [ ] 確認 Phase 0 / Phase 2 的 proxy 與 client IP 設定已完成，Auth rate limit 不使用可由 client 任意偽造的 IP header。
- [ ] 設計並實作 Auth rate limit：
  - [ ] Redis key 命名與 window 設定。
  - [ ] local development / test 的 in-memory fallback。
  - [ ] `rate_limited` 錯誤回應。
- [ ] 實作登入失敗防護：
  - [ ] IP 維度登入嘗試限制。
  - [ ] Email 維度連續失敗次數。
  - [ ] 連續失敗達上限後鎖定 `15` 分鐘。
  - [ ] 登入成功後清除該帳號失敗計數。
- [ ] 建立 `EmailTaskRepository.createPending`，供 Auth 與後續 Service 在業務 Transaction 中建立寄信任務；worker claim 與投遞功能在 Phase 3.5 完成。
- [ ] 實作 `POST /auth/activation/:token`：
  - [ ] 驗證 activation token hash 與到期時間。
  - [ ] 套用 activation API 的 IP rate limit。
  - [ ] 套用共用密碼規則。
  - [ ] 設定 Argon2id password hash。
  - [ ] 清除 activation token hash 與到期時間。
  - [ ] 寫入 `activated_at`。
  - [ ] 依管理員移交流程判斷是否啟用帳號。
- [ ] 實作 `POST /auth/password-reset/request`：
  - [ ] 不揭露 Email 是否存在。
  - [ ] 產生 password reset token hash 與到期時間。
  - [ ] 建立 password reset email task。
  - [ ] 套用 password reset rate limit。
- [ ] 實作 `POST /auth/password-reset/:token`：
  - [ ] 驗證 password reset token hash 與到期時間。
  - [ ] 套用共用密碼規則。
  - [ ] 更新 Argon2id password hash。
  - [ ] 清除 password reset token hash 與到期時間。
  - [ ] 撤銷該使用者既有 session。
  - [ ] 建立 `user.password_reset_completed` audit log。
- [ ] 建立共用密碼 schema / policy：
  - [ ] 長度至少 `12` 字元。
  - [ ] 禁止常見弱密碼。
  - [ ] 不允許與 Email local part 完全相同。
- [ ] 補 Auth 自動化測試：
  - [ ] Login 成功、失敗與不洩漏帳號狀態的回應。
  - [ ] Session cookie 的 `HttpOnly`、`Secure`、`SameSite`、`Path` 與有效期限。
  - [ ] Session 閒置期限、絕對期限與 revoked session。
  - [ ] Logout 撤銷目前 session。
  - [ ] CSRF token 取得、輪替、缺漏與錯誤 token。
  - [ ] advisor / reviewer / admin permission mapping 與 `403 forbidden`。
  - [ ] Login IP rate limit、Email 失敗鎖定與登入成功後清除計數。
  - [ ] Activation token 過期、使用後失效與密碼規則。
  - [ ] Password reset 不洩漏 Email、token 過期、使用後失效、撤銷 session 與 audit log。

完成條件：

- 已啟用使用者可以登入並取得 HttpOnly session cookie。
- 登入後可以取得 `/auth/me` 與 CSRF token。
- 權限不足的 API 會回傳 `403 forbidden`。
- Login、activation 與 password reset 具備第一版 rate limit 與不洩漏帳號狀態的錯誤回應。
- 帳號啟用與密碼重設流程會建立必要 email tasks 並清除 token hash。
- Auth、Session、CSRF、Permission、Rate Limit、Activation 與 Password Reset 具有自動化測試。

## Phase 3.5：最小 Email Delivery 基礎

目標：讓 Phase 3 建立的 password reset email task，以及 Phase 4 建立的 account activation email task 可以實際寄送。此階段只建立可用的最小投遞能力；提醒排程、手動重寄與故障維運留在 Phase 10。

- [ ] 建立 `EmailTaskRepository`：
  - [ ] 沿用 Phase 3 的 `createPending`，補齊 worker 所需查詢與狀態更新。
  - [ ] 使用 `FOR UPDATE SKIP LOCKED` claim `scheduled_at <= NOW()` 的 pending tasks。
  - [ ] 標記 `sent` 並寫入 `sent_at`。
  - [ ] 寄送失敗時增加 `attempt_count` 並寫入安全處理後的 `last_error`。
  - [ ] 未達重試上限時重新排程為 `pending`，達上限時標記為 `failed`。
- [ ] 建立 Email provider / sender adapter，Service 與 worker 不直接綁定特定寄信套件。
- [ ] 建立 account activation 與 password reset Email template mapping。
- [ ] 建立可單次執行的 worker function，排程器只負責定期呼叫，方便測試與安全停止。
- [ ] 確保 Email payload、application log 與 `last_error` 不保存或輸出密碼、token hash、SMTP credential；原始一次性 token 只可存在需要寄出的連結 payload，寄送與錯誤 log 不得輸出。
- [ ] 補最小 worker 測試：
  - [ ] 只 claim 已到 `scheduled_at` 的 pending task。
  - [ ] 平行 worker 不會取得同一筆 task。
  - [ ] 寄送成功改為 `sent`。
  - [ ] 可重試錯誤會重新排程。
  - [ ] 達上限後改為 `failed`。

完成條件：

- Password reset 與 account activation email task 可以從 `pending` 被 worker 寄送並更新為 `sent`。
- Worker crash 或寄送失敗不會造成同一筆 task 被無限制重複寄送。
- Phase 4 建立帳號後，啟用信可以完成實際投遞，不只停留在資料庫 task。

## Phase 4：管理員最小後台能力

目標：讓系統可以建立第一版必要的帳號、指導老師與主任資料。

- [ ] 建立初始管理員維運指令。
- [ ] 實作 `UserAdminService` 最小功能：
  - [ ] list users
  - [ ] create user
  - [ ] 建立帳號時產生 activation token hash 與到期時間
  - [ ] 建立 account activation email task
  - [ ] activate / deactivate user
  - [ ] resend activation
  - [ ] resend activation 時產生新的 activation token hash 與 email task
  - [ ] send password reset
  - [ ] send password reset 時產生 password reset token hash 與 email task
- [ ] 實作 `AdvisorAdminService` 最小功能：
  - [ ] list advisors
  - [ ] create advisor with user relation
  - [ ] update advisor
  - [ ] activate / deactivate advisor
  - [ ] assign director
- [ ] 對使用者、指導老師與主任異動建立 `audit_logs`。
- [ ] 補管理員最小能力測試：
  - [ ] 初始管理員維運指令、唯一啟用管理員與 audit log。
  - [ ] 建立／停用使用者會建立或撤銷必要 token、session、email task 與 audit log。
  - [ ] 指導老師建立、停用與主任異動的權限、constraint 與 audit log。

完成條件：

- 系統可以建立承辦人、管理員與指導老師帳號。
- 建立帳號後可透過 Phase 3.5 Email worker 寄出啟用信，並由 Phase 3 activation API 完成首次密碼設定。
- 前台可查詢可選指導老師資料所需的基礎資料已具備。

## Phase 5：規則與公開送件

目標：完成公開建立申請的第一條端到端資料流。

- [ ] 建立 `PointRuleRepository`。
- [ ] 建立有效人數規則查詢。
- [ ] 建立四種點數規則查詢。
- [ ] 建立公開指導老師列表 API。
- [ ] 建立公開申請說明 API。
- [ ] 建立建立申請 Zod discriminated union。
- [ ] 建立 file validation 與 storage adapter。
- [ ] 實作 `POST /public/applications`：
  - [ ] 驗證申請人是參與者之一。
  - [ ] 查詢首次送件適用規則。
  - [ ] 計算各類型申請點數。
  - [ ] 建立 `point_applications`。
  - [ ] 建立 `application_participants`。
  - [ ] 建立類型專屬資料。
  - [ ] 建立 `application_versions` 第一版快照。
  - [ ] 更新 `current_version_id`。
  - [ ] 建立附件 metadata。
  - [ ] 建立老師簽核通知與提醒 `email_tasks`。
- [ ] 對公開指導老師、申請說明與建立申請 API 套用輸入長度限制；建立申請 API 套用第一版 IP rate limit。
- [ ] 補規則與公開送件測試：
  - [ ] 有效期間規則查詢、人數上下限與四類點數計算。
  - [ ] 四類 Zod discriminated union 與跨欄位驗證。
  - [ ] 送件成功建立主表、參與者、專屬資料、版本、附件與 email tasks。
  - [ ] 任一步驟失敗時資料庫 rollback，已寫入的新檔案會清理。
  - [ ] 檔案類型、大小、數量、storage key 與路徑穿越防護。
  - [ ] 建立申請 rate limit。

完成條件：

- 公開 API 可以成功建立一筆 `pending_advisor` 申請。
- 申請資料、參與者、版本、附件 metadata 與 email tasks 在同一 Transaction 中一致建立。

## Phase 6：指導老師簽核

目標：完成老師登入後簽核或拒絕申請的流程。

- [ ] 實作 advisor pending list。
- [ ] 實作 advisor pending detail。
- [ ] 實作簽名檔案驗證與 storage。
- [ ] 實作 advisor approve：
  - [ ] lock `point_applications`
  - [ ] 驗證狀態與期限
  - [ ] 驗證目前登入老師符合 `advisor_id`
  - [ ] 建立 `advisor_signatures`
  - [ ] 建立 `advisor_approved`
  - [ ] 狀態改為 `under_review`
- [ ] 實作 advisor reject：
  - [ ] reason 必填
  - [ ] 建立 `advisor_rejected`
  - [ ] 狀態改為 `rejected`
  - [ ] 寫入 `closed_at`
  - [ ] 建立拒絕通知
- [ ] 補指導老師流程測試：
  - [ ] 只能讀取與處理自己的申請。
  - [ ] 狀態、簽核期限、重複簽名與 reason 驗證。
  - [ ] 簽名成功／拒絕的狀態、review action、signature、email task 與檔案 rollback。

完成條件：

- 指導老師只能處理自己的 `pending_advisor` 申請。
- 簽核後申請進入 `under_review`。

## Phase 7：承辦人審核與補件

目標：完成承辦人審核主流程，包含補件、延長補件期限與最終審核。

- [ ] 實作 review queue。
- [ ] 實作 review detail。
- [ ] 實作 request revision：
  - [ ] 建立 edit token hash
  - [ ] 狀態改為 `needs_revision`
  - [ ] 建立 `revision_requested`
  - [ ] 建立補件通知與提醒
- [ ] 實作 extend revision：
  - [ ] 驗證 `needs_revision`
  - [ ] 驗證 token 未過期
  - [ ] 更新 `edit_token_expires_at`
  - [ ] 建立 `revision_extended`
  - [ ] 重新安排尚未寄出的補件提醒
- [ ] 實作 public revision get。
- [ ] 實作 public revision submit：
  - [ ] 更新目前資料表
  - [ ] 建立新版本
  - [ ] 舊簽名標記失效
  - [ ] 清除 edit token
  - [ ] 狀態回到 `pending_advisor`
- [ ] 實作 reject。
- [ ] 實作 adjust before approval。
- [ ] 實作 approve。
- [ ] 對 public revision get / submit 套用第一版 IP rate limit。
- [ ] 補承辦人審核與補件測試：
  - [ ] Review queue/detail 的權限、分頁與資料範圍。
  - [ ] 補件 token 錯誤、過期、使用後失效與延長期限。
  - [ ] 補件建立新版本、失效舊簽名、清除 token 並重新建立老師通知。
  - [ ] 核准／拒絕／調整前的狀態、reason、點數與有效簽名驗證。
  - [ ] 同一申請被多位承辦人同時處理時只允許一筆成功。

完成條件：

- 承辦人可以要求補件，申請人可重新提交，並重新進入老師簽核。
- 承辦人可以核准 `under_review` 申請並關閉流程。

## Phase 8：點數流水帳與公開點數查詢

目標：讓核准後點數可被查詢，並支援公開總表。

- [ ] 核准時建立 `student_point_transactions` award 紀錄。
- [ ] 寫入姓名、學年度、年級、班級快照。
- [ ] 實作證照累積上限 advisory lock。
- [ ] 建立 `StudentPointTransactionRepository`。
- [ ] 建立 `student_points_summary` query repository。
- [ ] 實作 `GET /public/student-points`：
  - [ ] academicYear
  - [ ] grade
  - [ ] classNumber
  - [ ] keyword
  - [ ] pagination
  - [ ] sorting
  - [ ] 姓名與學號遮罩
- [ ] 對公開學生點數查詢套用 query 長度、分頁上限與第一版 IP rate limit。
- [ ] 補點數流水帳與公開查詢測試：
  - [ ] 核准時每位參與者只建立一筆 award，且正確保存學生快照。
  - [ ] `student_points_summary` 依學年度、年級、班級與學生正確分組加總。
  - [ ] 公開 response 只回傳遮罩後姓名與學號。
  - [ ] 兩筆證照同時核准時，advisory lock 可防止累積點數超限。
  - [ ] 公開查詢 rate limit。

完成條件：

- 核准申請會產生不可變點數流水帳。
- 公開點數總表只回傳遮罩後資料。

## Phase 9：點數異動

目標：完成核准後點數調整與沖銷流程。

- [ ] 實作 reviewer create point change request。
- [ ] 實作 admin list point change requests。
- [ ] 實作 admin point change request detail。
- [ ] 實作 admin approve：
  - [ ] lock change request
  - [ ] lock target transaction
  - [ ] 驗證 adjustment / reversal 規則
  - [ ] 建立 adjustment 或 reversal transaction
  - [ ] 更新 request status
- [ ] 實作 admin reject。
- [ ] 建立對應 audit logs 與 email tasks。
- [ ] 補點數異動測試：
  - [ ] 同一目標交易只能有一筆 pending change request。
  - [ ] adjustment / reversal 規則與學生來源點數不得低於 `0`。
  - [ ] 管理員核准會建立新流水帳、更新 request、audit log 與 email task。
  - [ ] 管理員拒絕不建立流水帳。
  - [ ] 平行核准同一 change request 只允許一筆成功。

完成條件：

- 承辦人不能直接改流水帳。
- 管理員核准後才會新增 adjustment 或 reversal 紀錄。

## Phase 10：背景任務、私有檔案與測試收斂

目標：在各 Phase 已有對應測試的前提下，補齊非同步維運流程、安全檔案讀取、跨模組回歸與第一版上線門檻。

- [ ] 擴充 Phase 3.5 Email worker 維運能力：
  - [ ] email delivery permanently failed notification。
  - [ ] worker 啟動、停止與健康狀態整合。
- [ ] 實作 expired session cleanup job。
- [ ] 實作手動 retry failed email task。
- [ ] 實作 stale processing email task maintenance。
- [ ] 實作 advisor confirmation expired job。
- [ ] 實作 revision expired job。
- [ ] 實作 private attachment read API。
- [ ] 實作 private advisor signature read API。
- [ ] 建立部署前應用程式生命週期：
  - [ ] 監聽 `SIGTERM` / `SIGINT`。
  - [ ] 呼叫 `server.close()` 停止接收新的 HTTP request。
  - [ ] 關閉 PostgreSQL pool，例如呼叫 `closePool()`。
  - [ ] 關閉 Redis connection。
  - [ ] 停止 Email worker claim 新任務，並讓已取得任務完成或依 timeout 收尾。
  - [ ] 若 legacy Mongo runtime 仍啟用，關閉 Mongo connection 與舊背景 jobs。
  - [ ] 建立 health / readiness endpoint，readiness 必須反映必要服務是否可用。
- [ ] 建立部署前 HTTP / Reverse Proxy 安全設定：
  - [ ] 正式環境預設 same-origin 部署：`/` 由 frontend 提供，`/api` 由 backend 提供。
  - [ ] 正式環境不得使用無限制的 `cors()`；local development 若前後端不同 port，才使用明確 CORS allowlist。
  - [ ] 依實際 Nginx / reverse proxy 拓樸設定 Express `trust proxy`。
  - [ ] 確認 client IP 來源不可由外部 request 任意偽造，並讓 rate limit 與 audit log 使用同一套 IP helper。
  - [ ] request context 在可信任 proxy 情境取得正確 IP。
- [ ] 確認各 Phase migration / repository / service / API tests 已隨功能完成，不在本階段才第一次補測試。
- [ ] 建立可重複執行的 migration verification command，至少驗證：
  - [ ] 從空測試資料庫執行全部 migration。
  - [ ] extension、trigger function、必要 constraint 與 index 存在。
  - [ ] 所有具有 `updated_at` 的實體表都有 `set_updated_at()` trigger。
  - [ ] `student_points_summary` View 可查詢。
  - [ ] 執行最小 test seed。
  - [ ] 重跑 migration runner 不會重複套用已完成 migration。
- [ ] 補跨模組回歸測試。
- [ ] 補完整 concurrency tests。
- [ ] 建立 CI 第一版最低門檻：build、migration verification、unit、repository、service、API 與 concurrency tests。

完成條件：

- Email、逾期作廢與私有檔案流程可被測試覆蓋。
- 第一版核心流程可在測試資料庫穩定重跑。
- CI 可從乾淨環境建立 schema、執行 seed、跑完第一版必要測試並阻止失敗版本進入部署流程。

## 目前補強 Sprint

Phase 1 資料庫與 Phase 3 Auth 基礎已部分實作，但前置啟動邊界與測試基礎尚未完成。繼續擴充 Auth API 前，建議依下列順序補強：

- [x] 完成 Phase 0 PostgreSQL app / server 啟動分離與 legacy Mongo 隔離。
- [x] 完成 Phase 2 test runner、測試資料庫與 Express app test harness。
- [ ] 保留 Phase 1 乾淨資料庫 migration / seed 人工驗證紀錄；自動化 migration verification command 延後到 Phase 10 / 部署前 CI 收斂。
- [x] 完成 Phase 2 body limit、client IP helper 與敏感 log 設定；正式 CORS / trusted proxy 延後到 Phase 10 / 部署前。
- [ ] 為目前已完成的 transaction、validation、constraint mapping、Session、CSRF 與 Permission 補測試。
- [ ] 再繼續 Phase 3 Auth rate limit、登入失敗防護、Activation 與 Password Reset。
- [ ] 完成 Phase 3.5 最小 Email worker 後，再進入 Phase 4 帳號管理。

此 Sprint 完成後，PostgreSQL 新主流程才能在沒有舊 Mongo 系統的情況下獨立啟動，後續 Auth 與管理員流程也會有可持續執行的自動化驗證基礎。
