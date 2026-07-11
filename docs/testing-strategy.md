# 測試策略

本文件定義第一版後端測試分層、PostgreSQL 測試資料庫策略、migration 驗證、核心流程測試矩陣、併發測試與 CI 最低門檻。API contract 請參考 [API Request / Response Schema](api-schemas.md)，Transaction 與鎖定策略請參考 [Transaction 與併發控制](transaction-concurrency.md)。

## 目標

- 確保資料庫 schema、constraint、index、view 與 migration 可在乾淨環境重建。
- 確保 Service 層的業務規則、狀態轉換與 Transaction 行為符合文件。
- 確保 API request / response、權限與錯誤碼穩定。
- 確保點數流水帳、補件版本、簽名、Email task、file storage 與 audit log 不會留下半完成狀態。
- 對高風險流程建立併發測試，例如多位承辦人同時核准與證照點數上限。

## 測試分層

| 層級 | 主要測試內容 | 是否連 DB | 範例 |
| --- | --- | --- | --- |
| Unit test | 純函式、formatter、masking、point calculation、permission mapping | 否 | 學號遮罩、點數計算、角色權限集合 |
| Repository integration test | SQL、constraint、index、view、transaction client | 是 | `student_points_summary`、token hash lookup、partial unique index |
| Service integration test | 業務規則、Transaction、狀態轉換、email task/audit log 建立 | 是 | 送件、簽核、補件、核准、點數異動 |
| API test | HTTP route、Zod、auth、permission、response schema、error code | 是 | `POST /public/applications`、`POST /auth/login` |
| Worker test | Email worker、逾期作廢 job、stale processing job | 是 | `FOR UPDATE SKIP LOCKED` claim、retry、expired application |
| Migration test | 從空 DB 套用 migration、建立 seed、驗證 view/trigger | 是 | CI 乾淨 DB migration |
| Storage integration test | 本機私有檔案寫入、讀取、rollback cleanup | 可選 DB | 附件寫入失敗、簽名檔案缺失 |

第一版不要求完整端對端瀏覽器測試；若前端實作後需要驗證簽名板、multipart 表單或登入 cookie 行為，再補 Playwright E2E。

## PostgreSQL 測試資料庫

建議使用獨立測試資料庫，不共用開發資料庫。

```text
DATABASE_URL=postgres://.../points_review_test
NODE_ENV=test
```

測試資料庫規則：

- 測試啟動前套用最新 migration。
- 每個 test suite 可使用 transaction rollback 清理資料。
- 需要測試 transaction commit 後 side effect 的流程，例如 Email worker claim、advisory lock 併發測試，可使用 truncate/reset fixture。
- 測試資料必須使用 deterministic seed，不依賴開發環境展示資料。
- 測試不得連正式資料庫。

建議清理策略：

| 測試類型 | 清理方式 |
| --- | --- |
| Repository / Service 單一流程 | 每個 test 開 transaction，結束 rollback |
| Worker / concurrency | 每個 test 前 truncate 相關表，重新 seed 最小資料 |
| Migration test | drop database / create database / run migration |
| File storage | 使用臨時目錄，測試後刪除臨時檔案 |

## Migration 驗證

每次調整 migration 時，CI 至少執行：

1. 建立乾淨 PostgreSQL database。
2. 從第一個 migration 跑到最新版本。
3. 驗證所有 extension 與 trigger function 存在。
4. 驗證所有具有 `updated_at` 的資料表已掛 `set_updated_at()` trigger。
5. 驗證 `student_points_summary` View 可查詢。
6. 執行最小 seed，例如 test accounts 與初始點數規則。
7. 重跑 migration runner，確認已執行 migration 不會重複套用。

Migration test 不依賴 down migration；正式策略仍是 forward migration。

## Unit Tests

第一版至少涵蓋：

- 點數計算：
  - 競賽 `per_person`。
  - 競賽 `shared_total`。
  - 參與計畫薪資換點。
  - 證照固定點數。
  - 展覽點數範圍。
- 公開資料遮罩：
  - 姓名遮罩。
  - 學號遮罩。
- 固定代碼轉換：
  - `grade` 顯示文字。
  - `classNumber` 顯示文字。
  - `advisor.titleCode` 顯示文字。
- 權限映射：
  - advisor/reviewer/admin 的權限集合。
  - 新增權限時測試必須失敗直到更新 mapping。
- storage key helper：
  - 安全字元。
  - 不接受路徑穿越。
  - 不使用原始檔名作為 storage path。

## Repository Tests

Repository 測試直接驗證 SQL 與資料庫限制。

至少涵蓋：

- `users`：
  - email unique。
  - one active admin partial unique index。
  - activation/reset token pair check。
- `user_sessions`：
  - token hash unique。
  - revoked pair check。
  - active session query。
- `advisors`：
  - one active director partial unique index。
  - title code check。
- `point_applications` / `application_versions`：
  - `current_version_id` 複合外鍵只允許指向同一申請版本。
  - status / closed_at check。
- `application_participants`：
  - one applicant per application。
  - grade/classNumber check。
- `application_attachments`：
  - `(application_version_id, storage_key)` unique。
  - 複合 FK 確保附件版本屬於同一申請。
- `advisor_signatures`：
  - one valid signature per version。
  - invalidated pair check。
- `student_point_transactions`：
  - one award per participant。
  - snapshot 欄位必填。
- `student_point_change_requests`：
  - one pending change per transaction。
  - approved/rejected 欄位配對。
- `student_points_summary`：
  - 依 academicYear/grade/classNumber/studentNumber 分組。
  - adjustment/reversal 沿用快照後能正確加總。

## Service Tests

Service integration tests 驗證業務規則與 Transaction side effect。

### 申請送件

測試案例：

- 申請人必須是參與者之一。
- 送件時依 `submitted_at` 查詢有效點數規則。
- 每種申請類型建立正確專屬資料。
- 建立 `application_versions` 第一版。
- `current_version_id` 指向第一版。
- 建立附件 metadata 與檔案。
- 建立老師簽核通知與提醒 `email_tasks`。
- 任一步驟失敗時 rollback，且清理本次新寫入檔案。

### 指導老師簽核

測試案例：

- 只有該申請指導老師可以簽名。
- 申請狀態必須是 `pending_advisor`。
- 逾期不可簽名。
- 同版本不可重複有效簽名。
- 簽名成功後狀態改為 `under_review`。
- 寫入 `advisor_signatures` 與 `application_review_actions`。
- 簽名檔案寫入失敗時整個操作失敗。

### 補件

測試案例：

- 只有 `needs_revision` 可補件。
- token 過期、錯誤或已使用都回傳 `revision_token_invalid`。
- 補件建立新版本。
- 舊有效簽名標記失效。
- 補件 token 清除。
- 狀態回到 `pending_advisor`。
- 建立新版本老師簽核通知與提醒。
- 延長補件期限只能在 `needs_revision` 且 token 未過期時執行。
- 延長補件期限不重發 token，會更新 `edit_token_expires_at`、建立 `revision_extended` 審核紀錄與通知。

### 承辦人審核

測試案例：

- 只有 `under_review` 可核准或拒絕。
- 核准前必須已有有效老師簽名。
- 核准點數加總必須等於 `approved_total_points`。
- 核准成功建立每位參與者 `student_point_transactions`。
- 狀態改為 `approved` 並寫入 `closed_at`。
- 拒絕必須填寫 reason。
- 要求補件必須產生 edit token 與補件通知。

### 點數異動

測試案例：

- 承辦人只能建立 pending change request，不直接修改流水帳。
- 同一目標交易不可有兩筆 pending change request。
- 管理員核准 adjustment 後建立新流水帳。
- reversal 必須等於原始交易尚未沖銷點數的相反數。
- 異動後學生該筆來源點數不得小於 `0`。
- 管理員拒絕只更新 request 狀態，不建立流水帳。

## API Tests

API tests 驗證 route、Zod、auth、permission、response schema 與錯誤碼。

至少涵蓋：

- Auth：
  - login 成功設定 HttpOnly cookie。
  - logout 撤銷目前 session。
  - `/auth/me` 回傳目前使用者與 permissions。
  - password reset request 不揭露 email 是否存在。
- Public：
  - 建立申請成功。
  - multipart 檔案格式錯誤回傳 `file_type_not_allowed`。
  - 公開點數查詢只回傳 masked 欄位。
- Advisor：
  - 老師不能查看其他老師申請。
  - 老師簽名成功。
  - 老師拒絕必須有 reason。
- Reviewer：
  - 待審列表分頁。
  - 要求補件。
  - 核准與拒絕。
- Admin:
  - users/advisors 管理 API 需要 admin 權限。
  - audit logs 只有 admin 可查。
  - 管理員不能核准一般申請。
- Private file:
  - 未登入不可讀附件。
  - 無資料範圍不可讀附件。
  - 成功讀取時 response header 正確，且不回傳 `storageKey`。

## 權限與資料範圍測試

角色矩陣至少測：

| 情境 | 預期 |
| --- | --- |
| advisor 讀自己的 pending application | 允許 |
| advisor 讀其他老師 application | `404` 或 `403` |
| reviewer 核准 under_review application | 允許 |
| reviewer 管理 users | `403` |
| admin 查所有申請 | 允許 |
| admin 核准一般申請 | `403` |
| admin 核准 point change request | 允許 |
| 未登入讀後台 API | `401` |

Service 層也要測資料範圍，不能只依賴 middleware 測試。

## 併發測試

### 多位承辦人同時核准

測試方式：

1. 建立同一筆 `under_review` 申請。
2. 兩個 transaction 同時呼叫核准流程。
3. 第一個成功。
4. 第二個在取得 lock 後重新檢查狀態，回傳 `application_status_conflict`。
5. 只建立一組 `student_point_transactions`。

### 證照累積上限

測試方式：

1. 同一學生建立兩筆證照申請。
2. 平行核准兩筆會突破上限的申請。
3. advisory transaction lock 必須讓其中一筆成功，另一筆回傳 `certificate_points_limit_exceeded`。
4. 最終證照點數不得超過上限。

### Email worker claim

測試方式：

1. 建立多筆 pending email tasks。
2. 平行啟動兩個 worker claim。
3. 使用 `FOR UPDATE SKIP LOCKED` 確保同一 task 不被兩個 worker 取得。

## Email Worker 與排程測試

至少涵蓋：

- pending 且 `scheduled_at <= NOW()` 才會被 claim。
- 成功寄送改為 `sent` 並寫入 `sent_at`。
- 可重試錯誤增加 `attempt_count` 並重新排程。
- 達 `max_attempts` 後改為 `failed`。
- failed application-related email 建立 `email_delivery_failed`，且不無限遞迴。
- 管理員手動 retry failed email task 時建立新的 `email_tasks`，不覆蓋原 failed task，並建立 `email_task.retry_requested` audit log。
- 非 `failed` 狀態的 email task 不可手動 retry。
- stale processing task 可被 maintenance job 重置或標記 failed。
- 老師簽核提醒只排程在 `advisor_confirmation_expires_at` 前。
- 補件提醒只排程在 `edit_token_expires_at` 前。

Email provider 在測試中使用 fake adapter，不寄真信。

## 背景逾期作廢測試

至少涵蓋：

- `pending_advisor` 且超過 `advisor_confirmation_expires_at` 時改為 `rejected`。
- `needs_revision` 且超過 `edit_token_expires_at` 時改為 `rejected`。
- 狀態已被人工操作改變時，背景任務不得覆蓋結果。
- 作廢時建立 `application_review_actions`。
- 作廢時建立通知 email task。

## File Storage Tests

使用測試臨時目錄作為 `PRIVATE_FILE_STORAGE_ROOT`。

至少涵蓋：

- `storage_key` 正規化後不可逃出 root。
- 上傳 PDF/JPEG/PNG 成功。
- ZIP/RAR 或偽裝 MIME type 被拒絕。
- 單檔超過大小限制被拒絕。
- Transaction 失敗時清理本次新寫入檔案。
- 檔案 metadata 存在但實體檔案缺失時，不洩漏 storage key。

## Audit Log Tests

至少涵蓋：

- 管理員建立、停用 user 時建立 `audit_logs`。
- 指導老師建立、停用與主任異動建立 `audit_logs`。
- 管理員查看附件或簽名建立 `application_attachment.viewed` / `advisor_signature.viewed`。
- metadata 不包含 token、token hash、session token、storage key 或檔案內容。
- 非 admin 查詢 audit logs 回傳 `403`。

## 測試資料與 Seed

測試 seed 原則：

- 只建立測試需要的最小資料。
- 不依賴 development seed。
- 固定使用 deterministic email、學號、public id 或 helper 產生可預期資料。
- 每個測試清楚建立自己需要的申請狀態。
- 點數規則 seed 必須涵蓋四種申請類型。

建議提供 factory/helper：

- `createUser(role)`
- `createAdvisor()`
- `createPointRules()`
- `createApplication(status, type)`
- `createSignedApplication()`
- `createApprovedApplicationWithTransactions()`
- `createEmailTask(status)`

## CI 最低門檻

每次 push / pull request 至少執行：

1. Type check。
2. Lint。
3. Unit tests。
4. Migration test on clean PostgreSQL。
5. Repository integration tests。
6. Service integration tests。
7. API tests for auth, public application, advisor approve, reviewer approve, admin user/advisor management。

高成本併發測試可先放在 CI 必跑，若執行時間太長，再改為 nightly，但正式合併前仍必須可手動執行。

## 不納入第一版

第一版可暫不納入：

- 完整 browser E2E。
- Email HTML 視覺 snapshot。
- 大量資料壓力測試。
- 備份復原自動化演練。正式上線前仍需依 [私有檔案儲存設計](file-storage.md#備份與復原) 執行至少一次手動復原演練。

這些項目可在前端與部署環境穩定後補上。

## 尚待實作時確認

- 實際測試框架，例如 Vitest、Jest 或 Node.js test runner。
- API 測試工具，例如 Supertest 或框架內建 inject。
- PostgreSQL 測試資料庫啟動方式，例如 Docker Compose、Testcontainers 或本機 DB。
- CI 環境是否提供 PostgreSQL service。
- 併發測試在 CI 的穩定性與 timeout 設定。
