# 第一版實作計劃

本文件整理第一版後端實作順序與可追蹤 checklist。實作方向是在現有 Express 專案內逐步切換到 PostgreSQL / `pg`，不再延伸 MongoDB / Mongoose 的資料模型。產品流程、資料模型、API contract、Transaction 與測試細節仍以本目錄其他正式設計文件為準。

## 實作原則

- 從現有專案漸進改造，不另開新 backend skeleton。
- 第一版資料庫以 PostgreSQL 為主，MongoDB 舊路徑只作為過渡參考，不新增功能。
- Controller 只處理 HTTP 輸入輸出；Service 處理業務規則、Transaction 與狀態轉換；Repository 集中管理 SQL。
- 每個需要 Transaction 的 Service 必須使用同一個 transaction client 呼叫多個 Repository。
- 先讓 migration、schema 與核心資料流穩定，再擴展背景任務與管理功能。
- 每個階段至少保留可手動驗證或自動測試的完成條件。

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

### Phase 0 Checklist

- [x] 盤點現有 `src/` 的 entrypoint、routes、middlewares、controllers、models 與 jobs。
- [x] 決定舊 Mongo/Mongoose route 先保留但不新增功能，新 PostgreSQL route 依文件定義路徑逐步建立並隔離資料流。
- [x] 新增 PostgreSQL 相關環境變數規劃，例如 `DATABASE_URL`。
- [x] 確認現有 error handler、async handler、upload middleware 可否沿用；結論是 `asyncHandler` 可沿用，error handler 與 upload/storage 需依新 API contract 重構。
- [x] 更新 `package.json` scripts 規劃，保留既有啟動方式並加入 migration scripts；實際修改 package scripts 併入 Phase 1 第一個實作 commit。

完成條件：

- 專案中舊 Mongo 與新 PostgreSQL 實作邊界明確。
- 已確認第一個實作切入點與不搬動的舊功能範圍。

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
- [ ] 依 [Migration 與 Seed 方案](migration-plan.md) 建立 migration：
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
  - [ ] 四張點數規則表
  - [ ] 四張申請類型專屬表
  - [ ] `application_attachments`
  - [ ] `application_review_actions`
  - [ ] `advisor_signatures`
  - [ ] `student_point_transactions`
  - [ ] `student_point_change_requests`
  - [ ] `student_points_summary` View
- [ ] 建立 seed 執行方式。
- [ ] 建立初始點數規則 seed。
- [ ] 驗證乾淨資料庫可從第一個 migration 跑到最新版本。

完成條件：

- `migrate:up` 可在乾淨 PostgreSQL database 完整成功。
- `student_points_summary` View 可查詢。
- 所有具有 `updated_at` 的資料表都有 trigger。

## Phase 2：共用後端骨架

目標：建立後續 Service 與 Repository 共同使用的技術基礎。

- [x] 建立 PostgreSQL pool module。
- [x] 不建立全域 query helper；Repository 統一接收 `DatabaseClient`。
- [x] 建立 transaction helper。
- [x] 建立 Repository function 接收一般 client 或 transaction client 的慣例，並以 `UserRepository` 作為最小範例。
- [ ] 建立統一錯誤格式：
  - [ ] `{ code, message }`
  - [ ] Zod error `fields`
- [ ] 建立 DB constraint error 轉換策略。
- [ ] 建立 Zod validation middleware：
  - [ ] params
  - [ ] query
  - [ ] body
- [ ] 建立 request context helper：
  - [ ] ip address
  - [ ] user agent
  - [ ] current user

完成條件：

- 新 route 可使用 PostgreSQL query 與 transaction helper。
- Zod 驗證錯誤可回傳文件定義的 `validation_failed` 格式。

## Phase 3：Auth / Session / 權限

目標：完成登入後 API 的基礎身分驗證與授權。

- [ ] 實作密碼雜湊策略，優先 Argon2id；若先使用 bcrypt，需記錄原因與參數。
- [ ] 建立 `UserRepository`。
- [ ] 建立 `SessionRepository`。
- [ ] 實作 `POST /auth/login`。
- [ ] 實作 `POST /auth/logout`。
- [ ] 實作 `GET /auth/me`。
- [ ] 實作 `GET /auth/csrf-token`。
- [ ] 實作 authentication middleware。
- [ ] 實作 CSRF middleware。
- [ ] 實作 `Permission` 型別與 `rolePermissions` mapping。
- [ ] 實作 permission middleware。

完成條件：

- 已啟用使用者可以登入並取得 HttpOnly session cookie。
- 登入後可以取得 `/auth/me` 與 CSRF token。
- 權限不足的 API 會回傳 `403 forbidden`。

## Phase 4：管理員最小後台能力

目標：讓系統可以建立第一版必要的帳號、指導老師與主任資料。

- [ ] 建立初始管理員維運指令。
- [ ] 實作 `UserAdminService` 最小功能：
  - [ ] list users
  - [ ] create user
  - [ ] activate / deactivate user
  - [ ] resend activation
  - [ ] send password reset
- [ ] 實作 `AdvisorAdminService` 最小功能：
  - [ ] list advisors
  - [ ] create advisor with user relation
  - [ ] update advisor
  - [ ] activate / deactivate advisor
  - [ ] assign director
- [ ] 對使用者、指導老師與主任異動建立 `audit_logs`。

完成條件：

- 系統可以建立承辦人、管理員與指導老師帳號。
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

完成條件：

- 承辦人不能直接改流水帳。
- 管理員核准後才會新增 adjustment 或 reversal 紀錄。

## Phase 10：背景任務、私有檔案與測試收斂

目標：補齊非同步流程、安全檔案讀取與第一版測試門檻。

- [ ] 實作 Email worker：
  - [ ] claim pending tasks
  - [ ] sent
  - [ ] retry
  - [ ] failed
  - [ ] email delivery failed notification
- [ ] 實作手動 retry failed email task。
- [ ] 實作 stale processing email task maintenance。
- [ ] 實作 advisor confirmation expired job。
- [ ] 實作 revision expired job。
- [ ] 實作 private attachment read API。
- [ ] 實作 private advisor signature read API。
- [ ] 補 migration tests。
- [ ] 補 repository tests。
- [ ] 補 service integration tests。
- [ ] 補 API tests。
- [ ] 補 concurrency tests。

完成條件：

- Email、逾期作廢與私有檔案流程可被測試覆蓋。
- 第一版核心流程可在測試資料庫穩定重跑。

## 建議第一個 Sprint

第一個 Sprint 建議聚焦在資料庫與後端基礎，不先碰完整申請流程。

- [ ] 安裝 `pg` 與 `node-pg-migrate`。
- [ ] 建立 migration scripts。
- [ ] 建立 extensions、trigger function、`users`、`advisors`、規則表與 `point_applications` 相關 migration。
- [ ] 建立 PostgreSQL pool 與 transaction helper。
- [ ] 建立 Repository function 慣例。
- [ ] 建立最小 seed 與 migration 驗證方式。

Sprint 完成後，下一步再進入 Auth / Session 與公開送件。
