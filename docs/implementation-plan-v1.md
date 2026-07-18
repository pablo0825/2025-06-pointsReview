# 第一版實作計畫

本文件整理正式上線第一版的後端實作順序與可追蹤 checklist。版本範圍與 API Phase 歸屬請參考 [實作計畫總覽](implementation-plan.md)，第二版候選功能請參考 [第二版實作 Backlog](implementation-backlog-v2.md)。產品流程、資料模型、API contract、Transaction 與測試細節仍以本目錄其他正式設計文件為準。

第一版必須完成核心申請、簽核、補件、核准、點數流水帳、正式帳號生命週期、必要 Email 投遞、管理員核心資料與規則管理、Rate Limit、私有檔案、安全設定及 CI。核准後點數異動、Audit log 管理查詢、Email task 管理查詢與手動重寄延後到第二版；既有資料表與權限代碼可保留作為第二版預留，不代表第一版已開放對應 API。

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
  - `migrate:status` 結果為 migration files 21、applied migrations 21、pending migrations 0。
  - 已執行 `seed:development`，確認初始人數規則與四類點數規則 seed 筆數符合文件。
  - 已確認 `student_points_summary` View 可查詢，且所有具有 `updated_at` 的實體表都有 `set_updated_at()` trigger。
- [x] 新增 `application_instructions` 唯一鍵修正的 forward migration：
  - [x] 移除既有 `(application_type, section_key)` unique constraint。
  - [x] 建立 `(application_type, section_key, effective_from)` unique constraint，允許同一區塊保存歷年版本。
  - [x] 建立同一 `(application_type, section_key)` 有效期間不可重疊的 Exclusion Constraint。
  - [x] 重新執行乾淨資料庫 migration verification。
    - 已確認相鄰半開區間可共存、相同生效日由 version unique constraint 拒絕、重疊期間由 Exclusion Constraint 拒絕。
    - 已確認最新 migration 可執行 `migrate:down` 後重新 `migrate:up`，且重複執行 migration runner 不會再次套用已完成 migration。

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
    - 備註：`withRollback()` 是測試輔助工具，用於讓 DB 測試寫入資料後一律 rollback。第一版先建立 helper；helper 自身的成功 rollback、失敗 rollback 與 client release 測試，可等開始大量撰寫 Repository / Service database tests 前補上。
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

## Phase 3：Auth 核心 / Session / 權限

目標：完成可供後續業務 API 使用的登入、Session、CSRF 與權限基礎。本階段只處理 Auth 核心；Email 投遞基礎放在 Phase 4.2，帳號啟用與密碼重設放在 Phase 4.3，Rate Limit 與登入失敗鎖定集中到 Phase 9。

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
- [x] 補 Auth 自動化測試：
  - [x] Login 成功、失敗與不洩漏帳號狀態的回應。
  - [x] Session cookie 的 `HttpOnly`、`Secure`、`SameSite`、`Path` 與有效期限。
  - [x] Session 閒置期限、絕對期限與 revoked session。
  - [x] Logout 撤銷目前 session。
  - [x] CSRF token 取得、輪替、缺漏與錯誤 token。
  - [x] advisor / reviewer / admin permission mapping 與 `403 forbidden`。

完成條件：

- 開發／測試環境中的已啟用帳號可以登入並取得 HttpOnly session cookie。
- 登入後可以取得 `/auth/me` 與 CSRF token。
- 權限不足的 API 會回傳 `403 forbidden`。
- Auth、Session、CSRF 與 Permission 核心行為具有自動化測試。

## Phase 4：帳號與管理能力

Phase 4 依相依順序拆成三個可獨立驗收的子階段：Phase 4.1 先提供不依賴 Email 的管理資料與測試帳號；Phase 4.2 建立通用 Email task 最小投遞能力；Phase 4.3 再整合正式帳號建立、啟用與密碼重設。開發後續業務 API 可先使用 Phase 4.1 的 seed 帳號，但第一版正式上線前必須完成三個子階段。

### Phase 4.1：管理資料與開發帳號基礎

目標：先完成不依賴 Email 的管理資料查詢與維護能力。正式帳號建立、初始管理員啟用與密碼生命週期留到 Phase 4.3；在此之前，local development 與 test 使用 deterministic seed 建立已啟用測試帳號。

- [x] 建立 local development / test 專用的已啟用帳號 seed：
  - [x] 建立 admin、reviewer 與 advisor 最小測試帳號。
  - [x] 禁止在 production 執行或寫入固定測試密碼。
- [x] 實作 `UserAdminService` 不依賴 Email 的功能：
  - [x] list users
  - [x] get user detail
  - [x] update user
  - [x] activate existing user；只允許重新啟用 `activated_at IS NOT NULL`、曾完成密碼設定的帳號
  - [x] deactivate user 並撤銷該使用者既有 session
- [x] 實作 Phase 4.1 使用者管理 API：
  - [x] `GET /admin/users`
  - [x] `GET /admin/users/:userId`
  - [x] `PATCH /admin/users/:userId`
  - [x] `POST /admin/users/:userId/activate`
  - [x] `POST /admin/users/:userId/deactivate`
- [x] 實作 `AdvisorAdminService` 不建立登入帳號的功能：
  - [x] list advisors
  - [x] update advisor
  - [x] activate / deactivate advisor
  - [x] assign director
- [x] 實作 Phase 4.1 指導老師管理 API：
  - [x] `GET /admin/advisors`
  - [x] `PATCH /admin/advisors/:advisorId`
  - [x] `POST /admin/advisors/:advisorId/activate`
  - [x] `POST /admin/advisors/:advisorId/deactivate`
  - [x] `POST /admin/advisors/:advisorId/assign-director`
- [x] 每支管理 API 完成 route、Controller、Zod params/query/body、Authentication、CSRF、Permission、response mapper 與 API test，不以只有 Service 完成視為交付。
- [x] 對使用者、指導老師與主任異動建立 `audit_logs`。
- [x] 補管理員最小能力測試：
  - [x] Development / test seed 可重複執行，且 production 會拒絕執行。
  - [x] 使用者查詢、更新與停用的權限、session 撤銷及 audit log。
  - [x] 指導老師查詢、更新、停用與主任異動的權限、constraint 與 audit log。

完成條件：

- 開發與測試環境有可登入的 admin、reviewer 與 advisor 帳號，不依賴 Email 即可驗證後續 API。
- 管理員可以查詢、更新及停用既有使用者，並維護既有指導老師資料。
- 管理員重新啟用帳號時，不會繞過首次密碼設定與 activation 流程。
- 前台可查詢可選指導老師資料所需的基礎資料已具備。

### Phase 4.2：Email Task 最小投遞基礎

目標：建立不綁定帳號或申請業務的通用 Email task 投遞能力，讓後續 Phase 4.3 與 Phase 5 至 Phase 7 可以只負責建立通知任務，不直接呼叫特定寄信套件。

實作邊界：Phase 4.2 以 dependency injection 建立 `EmailProvider` 與 template renderer interface，測試使用 fake adapter，不在 Service 或 worker 綁定 Gmail、SMTP、SendGrid 等特定服務。實際 provider 確認後只需新增對應 adapter，不需修改 queue 與 retry 核心流程。Phase 4.2 只完成單次 worker、正常寄送與有限重試；`email_delivery_failed` 永久失敗通知、stale `processing` task maintenance，以及 worker 啟動、停止與健康狀態整合依計畫留在 Phase 10。

已確認行為：重複建立相同 `event_key` 時，比較收件人、模板、payload、申請關聯與重試上限等不可變業務欄位；內容一致時採冪等成功並回傳既有 task，內容不一致時視為程式錯誤，不覆蓋既有 task。`scheduled_at`、status、嘗試次數與錯誤等 delivery 狀態會在 worker 處理期間改變，不納入冪等比較。成功寄送保留 `attempt_count`、清除 `last_error`。Renderer 或 payload 錯誤與 provider 明確永久錯誤不可重試；timeout、rate limit、network、provider 5xx 與無法辨識的 provider 錯誤預設可重試。單次 worker 預設最多處理 `10` 筆，但每次只 claim 一筆，完成該筆狀態更新後才 claim 下一筆。

- [ ] 建立 `EmailTaskRepository`：
  - [ ] 在業務 Transaction 中建立 pending task。
  - [ ] 使用 `FOR UPDATE SKIP LOCKED` claim `scheduled_at <= NOW()` 的 pending tasks。
  - [ ] 標記 `sent` 並寫入 `sent_at`。
  - [ ] 寄送失敗時增加 `attempt_count` 並寫入安全處理後的 `last_error`。
  - [ ] 未達重試上限時重新排程為 `pending`，達上限時標記為 `failed`。
- [ ] 建立 `EmailTaskService`、template renderer interface 與 `EmailProvider` interface；使用 fake adapter 驗證核心流程，Service 與 worker 不直接綁定特定寄信套件。
- [ ] 建立可單次執行的 worker function；Phase 4.2 不直接整合常駐排程器，Phase 10 的 worker lifecycle 只負責定期呼叫此 function。
- [ ] 確保 Email payload、application log 與 `last_error` 不保存或輸出密碼、token hash、SMTP credential；原始一次性 token 只可存在需要寄出的連結 payload，寄送與錯誤 log 不得輸出。
- [ ] 補 Email task 與 worker 測試：
  - [ ] 業務 Transaction rollback 時不會留下 pending task。
  - [ ] 只 claim 已到期的 pending task，平行 worker 不會取得同一筆 task。
  - [ ] 使用 fake renderer 與 fake provider 驗證成功投遞。
  - [ ] 寄送成功、可重試失敗與永久失敗狀態轉換。
  - [ ] Email payload、log 與 `last_error` 不洩漏敏感資料。

完成條件：

- Service 可以在業務 Transaction 中建立 pending email task。
- Worker 可透過 fake provider 將 task 從 `pending` 推進到 `sent`，或依有限重試規則進入 `pending`／`failed`。
- 平行 worker 不會重複 claim 同一筆 task。
- Task 進入 `failed` 後會保留可稽核狀態；自動通知管理員與 worker crash recovery 由 Phase 10 補齊。

### Phase 4.3：正式帳號生命週期

目標：使用 Phase 4.2 的 Email task 基礎，完成正式帳號建立、首次密碼設定、密碼重設與管理員移交。此階段完成前，系統只使用 Phase 4.1 的非正式環境測試帳號，不把正式使用者 onboarding 視為可用。

- [ ] 建立共用 `passwordSchema`：
  - [ ] 驗證字串型別、至少 `12` 字元與合理最大長度。
- [ ] 建立 `PasswordPolicy`：
  - [ ] 禁止常見弱密碼。
  - [ ] 不允許與 Email local part 完全相同。
- [ ] 建立一次性帳號 Token 基礎：
  - [ ] 使用密碼學安全亂數產生 activation / password reset 原始 token。
  - [ ] 資料庫只保存 SHA-256 token hash 與到期時間。
  - [ ] 驗證 token 格式、hash、期限與使用後失效。
- [ ] 建立 account activation 與 password reset Email template mapping。
- [ ] 實作正式帳號建立與管理流程：
  - [ ] 建立初始管理員維運指令，產生 activation token、email task 與 audit log。
  - [ ] `UserAdminService.createUser` 建立帳號、activation token 與 email task。
  - [ ] activate user；deactivate user 沿用 Phase 4.1 已完成的流程。
  - [ ] resend activation，產生新 token 並使舊 token 失效。
  - [ ] send password reset，產生 password reset token 與 email task。
  - [ ] transfer admin。
  - [ ] `AdvisorAdminService.createAdvisor` 建立指導老師與登入帳號關聯。
- [ ] 實作帳號生命週期管理 API：
  - [ ] `POST /admin/users`
  - [ ] `POST /admin/users/:userId/transfer-admin`
  - [ ] `POST /admin/users/:userId/resend-activation`
  - [ ] `POST /admin/users/:userId/send-password-reset`
  - [ ] `POST /admin/advisors`
- [ ] 實作 `POST /auth/activation/:token`：
  - [ ] 驗證 activation token hash 與到期時間。
  - [ ] 套用共用密碼 schema 與 policy。
  - [ ] 設定 Argon2id password hash、清除 token 並寫入 `activated_at`。
  - [ ] 依初始管理員／管理員移交流程判斷是否啟用帳號。
- [ ] 實作 `POST /auth/password-reset/request`：
  - [ ] 不揭露 Email 是否存在。
  - [ ] 產生 password reset token hash、到期時間與 email task。
- [ ] 實作 `POST /auth/password-reset/:token`：
  - [ ] 驗證 password reset token hash 與到期時間。
  - [ ] 套用共用密碼 schema 與 policy。
  - [ ] 更新 Argon2id password hash、清除 token 並撤銷既有 session。
  - [ ] 建立 `user.password_reset_completed` audit log。
- [ ] 補正式帳號生命週期測試：
  - [ ] 帳號建立、重寄啟用與密碼重設會建立正確且不重複的 email tasks。
  - [ ] Activation / reset token 過期、使用後失效與密碼規則。
  - [ ] Password reset 不洩漏 Email，成功後撤銷 session 並建立 audit log。
  - [ ] 未完成首次密碼設定的帳號不能透過 Phase 4.1 activate API 繞過 activation。
  - [ ] 管理員移交符合唯一啟用管理員限制，並撤銷舊管理員 session。

完成條件：

- 系統可以建立正式 admin、reviewer 與 advisor 帳號，並透過 Email 完成首次密碼設定。
- Password reset request 可以寄出重設信，token 使用後立即失效並撤銷既有 session。
- 管理員移交、重寄啟用與管理員寄送密碼重設信都有完整 API、Audit log 與自動化測試。

## Phase 5：規則與公開送件

目標：完成公開建立申請的第一條端到端資料流。

Phase 5 開發可沿用 Phase 4.1 seed 帳號；正式端到端通知依賴 Phase 4.2 Email task 投遞能力，正式指導老師帳號 onboarding 依賴 Phase 4.3。

- [ ] 建立 `PointRuleRepository`。
- [ ] 建立 `ParticipantRuleRepository` 與有效人數規則查詢。
- [ ] 建立 `ApplicationInstructionRepository`。
- [ ] 建立四種點數規則查詢。
- [ ] 建立公開基礎資料 API：
  - [ ] `GET /public/advisors`
  - [ ] `GET /public/application-instructions?applicationType=...&includeHistorical=...`
- [ ] 實作管理端點數規則版本管理：
  - [ ] `GET /admin/point-rules?applicationType=...`
  - [ ] `POST /admin/point-rules`
  - [ ] `POST /admin/point-rules/:applicationType/:ruleId/deactivate`
- [ ] 實作管理端申請人數規則版本管理：
  - [ ] `GET /admin/application-participant-rules`
  - [ ] `POST /admin/application-participant-rules`
  - [ ] `POST /admin/application-participant-rules/:ruleId/deactivate`
- [ ] 實作輕量申請說明管理：
  - [ ] `GET /admin/application-instructions`
  - [ ] `POST /admin/application-instructions`
  - [ ] `PATCH /admin/application-instructions/:instructionId`
  - [ ] `POST /admin/application-instructions/:instructionId/show`
  - [ ] `POST /admin/application-instructions/:instructionId/hide`
  - [ ] 已生效內容不可原地改寫；建立新資料保留歷史，顯示狀態與排序依 API contract 管理。
- [ ] 對規則與說明異動建立 `audit_logs`；第一版只寫入，不提供管理端 Audit log 查詢 API。
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
- [ ] 對公開指導老師、申請說明與建立申請 API 套用輸入長度限制；Rate Limit 延後到 Phase 9。
- [ ] 補規則與公開送件測試：
  - [ ] 有效期間規則查詢、人數上下限與四類點數計算。
  - [ ] 點數規則、人數規則與申請說明管理的權限、期間重疊、歷史版本保護與 audit log。
  - [ ] 四類 Zod discriminated union 與跨欄位驗證。
  - [ ] 送件成功建立主表、參與者、專屬資料、版本、附件與 email tasks。
  - [ ] 任一步驟失敗時資料庫 rollback，已寫入的新檔案會清理。
  - [ ] 檔案類型、大小、數量、storage key 與路徑穿越防護。

完成條件：

- 公開 API 可以成功建立一筆 `pending_advisor` 申請。
- 申請資料、參與者、版本、附件 metadata 與 email tasks 在同一 Transaction 中一致建立。

## Phase 6：指導老師簽核

目標：完成老師登入後簽核或拒絕申請的流程。

- [ ] 實作指導老師申請 API：
  - [ ] `GET /advisor/applications/pending`
  - [ ] `GET /advisor/applications/pending/:publicId`
  - [ ] `POST /advisor/applications/pending/:publicId/approve`
  - [ ] `POST /advisor/applications/pending/:publicId/reject`
  - [ ] `GET /advisor/applications/history`
  - [ ] `GET /advisor/applications/history/:publicId`
- [ ] 建立 `AdvisorApplicationService` 查詢能力：
  - [ ] pending 只查目前 `status = 'pending_advisor'` 且 `advisor_id` 對應登入老師的申請。
  - [ ] history 只查登入老師已處理、目前不在 `pending_advisor` 的申請。
  - [ ] 補件重新提交後，申請重新出現在 pending；舊簽核與舊版本仍可從詳情歷史查詢。
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
  - [ ] Pending / history 列表的狀態分類、分頁與排序正確，且同一申請不會同時出現在兩者。
  - [ ] History detail 可讀取自己已處理申請的版本與簽核歷史，不能讀取其他老師申請。
  - [ ] 狀態、簽核期限、重複簽名與 reason 驗證。
  - [ ] 簽名成功／拒絕的狀態、review action、signature、email task 與檔案 rollback。
- [ ] 每支 Phase 6 API 完成 route、Controller、Zod params/query/body、Authentication、Permission、response mapper 與 API test，不以只有 Service 完成視為交付。

完成條件：

- 指導老師只能處理自己的 `pending_advisor` 申請。
- 簽核後申請進入 `under_review`。
- 指導老師可分頁查詢自己目前待簽核與已處理的申請，且可讀取對應詳情。

## Phase 7：承辦人審核與補件

目標：完成承辦人審核主流程，包含補件、延長補件期限與最終審核。

- [ ] 實作承辦人審核 API：
  - [ ] `GET /reviewer/applications/review`
  - [ ] `GET /reviewer/applications/review/:publicId`
  - [ ] `POST /reviewer/applications/review/:publicId/request-revision`
  - [ ] `POST /reviewer/applications/review/:publicId/extend-revision`
  - [ ] `POST /reviewer/applications/review/:publicId/adjust-before-approval`
  - [ ] `POST /reviewer/applications/review/:publicId/approve`
  - [ ] `POST /reviewer/applications/review/:publicId/reject`
  - [ ] `GET /reviewer/applications/history`
  - [ ] `GET /reviewer/applications/history/:publicId`
- [ ] 實作公開補件 API：
  - [ ] `GET /public/applications/revisions/:token`
  - [ ] `POST /public/applications/revisions/:token`
- [ ] 實作管理員申請唯讀 API：
  - [ ] `GET /admin/applications`
  - [ ] `GET /admin/applications/:publicId`
  - [ ] `GET /admin/applications/:publicId/review-actions`

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
- [ ] 實作 `GET /admin/student-point-transactions`，支援依學生、申請、類別與建立時間篩選。
- [ ] 實作 `GET /public/student-points`：
  - [ ] academicYear
  - [ ] grade
  - [ ] classNumber
  - [ ] keyword
  - [ ] pagination
  - [ ] sorting
  - [ ] 姓名與學號遮罩
- [ ] 對公開學生點數查詢套用 query 長度與分頁上限；Rate Limit 延後到 Phase 9。
- [ ] 補點數流水帳與公開查詢測試：
  - [ ] 核准時每位參與者只建立一筆 award，且正確保存學生快照。
  - [ ] `student_points_summary` 依學年度、年級、班級與學生正確分組加總。
  - [ ] 公開 response 只回傳遮罩後姓名與學號。
  - [ ] 兩筆證照同時核准時，advisory lock 可防止累積點數超限。

完成條件：

- 核准申請會產生不可變點數流水帳。
- 公開點數總表只回傳遮罩後資料。

## Phase 9：上線前安全收斂

目標：在核心 API 與帳號生命週期已穩定後，集中補齊第一版正式上線需要的防暴力嘗試與公開 API 防濫用措施。Local development 可停用 Rate Limit 或使用較高上限；production 必須使用 Redis-backed store。

- [ ] 建立可重用 Rate Limit 基礎：
  - [ ] 定義 Redis key 命名、window、counter 與到期策略。
  - [ ] Production 啟動時要求可用的 Redis rate limit store，不允許退回 in-memory。
  - [ ] Local development / test 可使用可注入、可重設的 in-memory store。
  - [ ] 統一回傳 `429 rate_limited`，且錯誤訊息不洩漏帳號或 token 狀態。
  - [ ] 使用 Phase 2 的 client IP helper；正式部署的 trusted proxy 驗證在 Phase 10 完成。
- [ ] 實作登入失敗防護：
  - [ ] `POST /auth/login` 每 IP 每 `15` 分鐘最多 `30` 次。
  - [ ] 同一 normalized Email 連續失敗 `5` 次後鎖定 `15` 分鐘。
  - [ ] Redis key 使用 normalized Email 的 SHA-256，不直接保存 Email。
  - [ ] 登入成功後清除該 Email 的失敗計數與鎖定狀態。
- [ ] 對帳號生命週期 API 套用限制：
  - [ ] `POST /auth/password-reset/request` 每 Email 每小時 `3` 次、每 IP 每小時 `20` 次。
  - [ ] `POST /auth/activation/:token` 每 IP 每小時 `30` 次。
- [ ] 對公開 API 套用限制：
  - [ ] `POST /public/applications` 每 IP 每小時 `20` 次。
  - [ ] `GET /public/applications/revisions/:token` 每 IP 每小時 `60` 次。
  - [ ] `POST /public/applications/revisions/:token` 每 IP 每小時 `20` 次。
  - [ ] `GET /public/student-points` 每 IP 每分鐘 `60` 次。
  - [ ] `GET /public/advisors` 每 IP 每分鐘 `120` 次。
  - [ ] `GET /public/application-instructions` 每 IP 每分鐘 `120` 次。
- [ ] 補 Rate Limit 自動化測試：
  - [ ] Window 內達上限回傳 `429`，window 到期後恢復。
  - [ ] IP 與 Email 維度互不混淆。
  - [ ] 登入成功會清除帳號失敗計數。
  - [ ] 不存在、未啟用、已停用帳號的外部回應不洩漏狀態。
  - [ ] Production 未設定 Redis 時拒絕啟動，development / test 可使用明確 fallback。

完成條件：

- Login、Activation、Password Reset 與指定公開 API 都有第一版 Rate Limit。
- 登入失敗鎖定不在 Redis key、log 或錯誤 response 暴露完整 Email 與帳號狀態。
- Rate Limit 不阻礙一般開發測試，但 production 不會在缺少 Redis 時無保護啟動。

## Phase 10：背景任務、私有檔案與測試收斂

目標：在各 Phase 已有對應測試的前提下，補齊非同步維運流程、安全檔案讀取、跨模組回歸與第一版上線門檻。

- [ ] 擴充 Phase 4.2 Email worker 維運能力：
  - [ ] email delivery permanently failed notification。
  - [ ] worker 啟動、停止與健康狀態整合。
- [ ] 實作 expired session cleanup job。
- [ ] 實作 stale processing email task maintenance。
- [ ] 實作 advisor confirmation expired job。
- [ ] 實作 revision expired job。
- [ ] 實作 private attachment read API：
  - [ ] `GET /advisor/applications/:publicId/attachments/:attachmentPublicId`
  - [ ] `GET /reviewer/applications/:publicId/attachments/:attachmentPublicId`
  - [ ] `GET /admin/applications/:publicId/attachments/:attachmentPublicId`
- [ ] 實作 private advisor signature read API：
  - [ ] `GET /advisor/applications/:publicId/signature`
  - [ ] `GET /reviewer/applications/:publicId/signature`
  - [ ] `GET /admin/applications/:publicId/signature`
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

Phase 0 啟動隔離與 Phase 2 測試基礎已有進度，目前先完成 Auth 核心驗證，不在這個 Sprint 提前實作 Rate Limit、Email worker、Activation 或 Password Reset：

- [x] 完成 Phase 0 PostgreSQL app / server 啟動分離與 legacy Mongo 隔離。
- [x] 完成 Phase 2 test runner、測試資料庫與 Express app test harness。
- [x] 保留 Phase 1 乾淨資料庫 migration / seed 人工驗證紀錄；自動化 migration verification command 延後到 Phase 10 / 部署前 CI 收斂。
- [x] 完成 Phase 2 body limit、client IP helper 與敏感 log 設定；正式 CORS / trusted proxy 延後到 Phase 10 / 部署前。
- [x] 為目前已完成的 transaction、validation 與 constraint mapping 補 Phase 2 測試。
- [x] 為 Login、Session、Cookie、CSRF 與 Permission 補 Phase 3 Auth 核心測試。
- [x] Phase 3 完成後進入 Phase 4.1，使用 development / test seed 帳號實作不依賴 Email 的管理資料功能。
- [ ] 需要通用通知投遞能力時進入 Phase 4.2；需要正式帳號 onboarding 時再進入 Phase 4.3。
- [ ] 核心業務 API 穩定後，在 Phase 9 一次完成 Auth 與公開 API Rate Limit。

此 Sprint 完成後，Auth 核心會有可持續執行的自動化驗證；Phase 4.2 Email 投遞、Phase 4.3 正式帳號生命週期與上線安全收斂仍保留在第一版，但不阻塞目前的核心 API 開發。
