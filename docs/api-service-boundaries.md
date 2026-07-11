# API Endpoint 與 Service 邊界

本文件定義第一版 API 分組、權限、Service 責任與 Repository 邊界。Request / response 欄位請參考 [API Request / Response Schema](api-schemas.md)，Zod 驗證責任請參考 [Zod 驗證規格](zod-validation.md)，資料表欄位請參考 [資料模型](data-model.md)，權限代碼請參考 [帳號與權限](authorization.md)，流程狀態請參考 [產品流程](product-workflows.md)。

## 分層原則

| 層級 | 責任 |
| --- | --- |
| Controller | 解析 HTTP request、呼叫 Zod 驗證、取得登入使用者、呼叫 Service、轉換 HTTP response |
| Service | 執行業務規則、資料所有權檢查、狀態轉換、Transaction、點數計算與通知任務建立 |
| Repository | 集中管理參數化 SQL，不判斷業務流程 |

Controller 不直接組 SQL，不直接處理 Transaction。Repository 不讀取 HTTP context，不決定使用者是否有權限操作某筆資料。

## 共用 API 規則

- 後台與登入後 API 需要 Authentication Middleware。
- 需要角色權限的 API 使用 Permission Middleware。
- Service 必須再次檢查資料所有權與申請狀態，不能只依賴 Permission Middleware。
- 已定義 `public_id` 的資源，API URL 必須使用 `public_id`，不使用內部 `BIGINT id`。
- 尚未定義 `public_id` 的後台管理資源，例如 `users`、`advisors` 與點數規則，第一版可使用內部 id；若未來需要出現在公開連結或 Email 連結中，再補 `public_id`。
- List API 必須支援分頁，預設 `page = 1`、`pageSize = 20`，最大 `pageSize = 100`。
- 時間欄位 API 回傳 ISO 8601 字串。
- 點數欄位 API 以字串回傳，例如 `"10.00"`，避免前端浮點誤差。
- 錯誤回傳使用穩定 `code`，人類可讀訊息放在 `message`。

錯誤格式：

```json
{
  "code": "application_status_conflict",
  "message": "申請狀態已變更，請重新整理後再操作。"
}
```

常用 HTTP 狀態：

| HTTP status | 使用情境 |
| --- | --- |
| `400` | Request 格式正確但業務輸入不合法 |
| `401` | 尚未登入或 session/token 無效 |
| `403` | 已登入但缺少權限或不符合資料所有權 |
| `404` | 資源不存在，或基於安全理由不揭露存在 |
| `409` | 狀態衝突、重複操作、併發下資料已變更 |
| `422` | Zod 驗證失敗 |

## 公開 API

| Method | Path | 用途 | Service | Transaction |
| --- | --- | --- | --- | --- |
| `POST` | `/public/applications` | 建立申請、參與者、類型專屬資料、附件 metadata、第一版快照與通知任務 | `ApplicationSubmissionService.submitApplication` | 是 |
| `GET` | `/public/applications/revisions/:token` | 驗證補件 token 並取得可編輯申請內容 | `RevisionService.getRevisionDraft` | 否 |
| `POST` | `/public/applications/revisions/:token` | 補件重新提交、建立新版本、使舊簽名失效、重新寄送老師簽核通知 | `RevisionService.resubmitApplication` | 是 |
| `GET` | `/public/student-points` | 查詢公開學生點數總表 | `StudentPointsPublicService.listSummary` | 否 |

公開 API 不需要登入，但需要 rate limit 與輸入長度限制。公開學生點數總表必須遮罩姓名與學號。

建立申請時，Service 必須：

- 驗證申請人是參與者之一。
- 依申請類型查詢送件當下有效點數規則。
- 計算各參與者申請點數與總點數。
- 建立 `point_applications`、`application_participants`、類型專屬資料表、`application_versions` 與附件 metadata。
- 更新 `current_version_id`。
- 建立老師簽核通知與提醒 email tasks。

## Auth API

| Method | Path | 用途 | Service | Transaction |
| --- | --- | --- | --- | --- |
| `POST` | `/auth/login` | 使用 Email 與密碼登入 | `AuthService.login` | 否 |
| `POST` | `/auth/logout` | 登出目前 session/token | `AuthService.logout` | 否 |
| `GET` | `/auth/me` | 取得目前登入使用者 | `AuthService.getCurrentUser` | 否 |
| `GET` | `/auth/csrf-token` | 取得目前 session 綁定的 CSRF token | `AuthService.getCsrfToken` | 否 |
| `POST` | `/auth/activation/:token` | 首次啟用帳號並設定密碼 | `AccountActivationService.activate` | 是 |
| `POST` | `/auth/password-reset/request` | 要求寄送密碼重設信 | `PasswordResetService.requestReset` | 是 |
| `POST` | `/auth/password-reset/:token` | 使用 token 重設密碼 | `PasswordResetService.resetPassword` | 是 |

登入、session、cookie 與 CSRF 規則請參考 [登入、Session 與安全設計](auth-session-security.md)。

## 指導老師 API

| Method | Path | 權限 | 用途 | Service | Transaction |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/advisor/applications/pending` | `advisor_applications.pending.list` | 等待自己簽核的申請列表 | `AdvisorApplicationService.listPending` | 否 |
| `GET` | `/advisor/applications/pending/:publicId` | `advisor_applications.pending.read` | 待簽核申請詳情 | `AdvisorApplicationService.getPendingDetail` | 否 |
| `POST` | `/advisor/applications/pending/:publicId/approve` | `advisor_applications.approve` | 老師簽名同意申請 | `AdvisorApplicationService.approve` | 是 |
| `POST` | `/advisor/applications/pending/:publicId/reject` | `advisor_applications.reject` | 老師拒絕申請並填寫原因 | `AdvisorApplicationService.reject` | 是 |
| `GET` | `/advisor/applications/history` | `advisor_applications.history.list` | 自己的歷史申請列表 | `AdvisorApplicationService.listHistory` | 否 |
| `GET` | `/advisor/applications/history/:publicId` | `advisor_applications.history.read` | 自己的歷史申請詳情 | `AdvisorApplicationService.getHistoryDetail` | 否 |
| `GET` | `/advisor/applications/:publicId/attachments/:attachmentPublicId` | `advisor_applications.attachments.read` | 讀取自己申請範圍內附件 | `PrivateFileService.getApplicationAttachment` | 否 |
| `GET` | `/advisor/applications/:publicId/signature` | `advisor_applications.signatures.read_own` | 讀取自己在該申請目前版本的有效簽名 | `PrivateFileService.getOwnAdvisorSignature` | 否 |

指導老師 Service 必須驗證該申請的 `advisor_id` 對應目前登入老師，且待簽核操作只能在 `pending_advisor` 狀態與 `advisor_confirmation_expires_at` 未逾期時執行。

## 承辦人 API

| Method | Path | 權限 | 用途 | Service | Transaction |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/reviewer/applications/review` | `applications.review.list` | 待審申請列表 | `ReviewerApplicationService.listReviewQueue` | 否 |
| `GET` | `/reviewer/applications/review/:publicId` | `applications.review.read` | 待審申請詳情 | `ReviewerApplicationService.getReviewDetail` | 否 |
| `POST` | `/reviewer/applications/review/:publicId/request-revision` | `applications.revision.request` | 要求補件並寄送補件連結 | `ReviewerApplicationService.requestRevision` | 是 |
| `POST` | `/reviewer/applications/review/:publicId/extend-revision` | `applications.revision.extend` | 延長補件期限 | `ReviewerApplicationService.extendRevision` | 是 |
| `POST` | `/reviewer/applications/review/:publicId/adjust-before-approval` | `applications.points.adjust_before_approval` | 核准前調整核准資料與點數 | `ReviewerApplicationService.adjustBeforeApproval` | 是 |
| `POST` | `/reviewer/applications/review/:publicId/approve` | `applications.approve` | 核准申請並建立學生點數流水帳 | `ReviewerApplicationService.approve` | 是 |
| `POST` | `/reviewer/applications/review/:publicId/reject` | `applications.reject` | 拒絕申請 | `ReviewerApplicationService.reject` | 是 |
| `GET` | `/reviewer/applications/history` | `applications.history.list` | 歷史申請列表 | `ReviewerApplicationService.listHistory` | 否 |
| `GET` | `/reviewer/applications/history/:publicId` | `applications.history.read` | 歷史申請詳情 | `ReviewerApplicationService.getHistoryDetail` | 否 |
| `GET` | `/reviewer/applications/:publicId/attachments/:attachmentPublicId` | `applications.attachments.read` | 讀取申請附件 | `PrivateFileService.getApplicationAttachment` | 否 |
| `GET` | `/reviewer/applications/:publicId/signature` | `applications.signatures.read` | 讀取申請目前版本的有效指導老師簽名 | `PrivateFileService.getApplicationAdvisorSignature` | 否 |
| `GET` | `/reviewer/point-change-requests` | `point_change_requests.list` | 查看核准後點數異動申請列表 | `PointChangeRequestService.listForReviewer` | 否 |
| `POST` | `/reviewer/point-change-requests` | `point_change_requests.create` | 建立核准後點數異動或沖銷申請 | `PointChangeRequestService.create` | 是 |

承辦人最終審核操作必須鎖定 `point_applications` 目標列，重新檢查狀態與目前版本。核准時必須在同一個 Transaction 中更新申請狀態、寫入審核紀錄、更新參與者核准點數、建立所有 `student_point_transactions` 與 email tasks。

## 管理員 API

| Method | Path | 權限 | 用途 | Service | Transaction |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/admin/users` | `users.list` | 使用者列表 | `UserAdminService.listUsers` | 否 |
| `GET` | `/admin/users/:userId` | `users.read` | 使用者詳情 | `UserAdminService.getUser` | 否 |
| `POST` | `/admin/users` | `users.create` | 建立帳號並寄送啟用信 | `UserAdminService.createUser` | 是 |
| `PATCH` | `/admin/users/:userId` | `users.update` | 更新使用者基本資料 | `UserAdminService.updateUser` | 是 |
| `POST` | `/admin/users/:userId/activate` | `users.activate` | 啟用帳號 | `UserAdminService.activateUser` | 是 |
| `POST` | `/admin/users/:userId/deactivate` | `users.deactivate` | 停用帳號 | `UserAdminService.deactivateUser` | 是 |
| `POST` | `/admin/users/:userId/transfer-admin` | `users.transfer_admin` | 將管理員移交給已完成密碼設定的新管理員 | `UserAdminService.transferAdmin` | 是 |
| `POST` | `/admin/users/:userId/resend-activation` | `users.activation.resend` | 重寄啟用信 | `UserAdminService.resendActivation` | 是 |
| `POST` | `/admin/users/:userId/send-password-reset` | `users.password_reset.send` | 寄送密碼重設信 | `UserAdminService.sendPasswordReset` | 是 |
| `GET` | `/admin/advisors` | `advisors.list` | 指導老師列表 | `AdvisorAdminService.listAdvisors` | 否 |
| `POST` | `/admin/advisors` | `advisors.create` | 建立指導老師與登入帳號關聯 | `AdvisorAdminService.createAdvisor` | 是 |
| `PATCH` | `/admin/advisors/:advisorId` | `advisors.update` | 更新指導老師資料 | `AdvisorAdminService.updateAdvisor` | 是 |
| `POST` | `/admin/advisors/:advisorId/activate` | `advisors.activate` | 啟用指導老師可選狀態 | `AdvisorAdminService.activateAdvisor` | 是 |
| `POST` | `/admin/advisors/:advisorId/deactivate` | `advisors.deactivate` | 停用指導老師可選狀態 | `AdvisorAdminService.deactivateAdvisor` | 是 |
| `POST` | `/admin/advisors/:advisorId/assign-director` | `advisors.assign_director` | 設定目前主任 | `AdvisorAdminService.assignDirector` | 是 |
| `GET` | `/admin/point-rules` | `point_rules.list` | 查詢點數規則 | `PointRuleAdminService.listRules` | 否 |
| `POST` | `/admin/point-rules` | `point_rules.create` | 建立新版本點數規則 | `PointRuleAdminService.createRuleVersion` | 是 |
| `POST` | `/admin/point-rules/:ruleId/deactivate` | `point_rules.deactivate` | 讓規則提前失效 | `PointRuleAdminService.deactivateRule` | 是 |
| `GET` | `/admin/point-change-requests` | `point_change_requests.list` | 點數異動申請列表 | `PointChangeRequestService.listForAdmin` | 否 |
| `GET` | `/admin/point-change-requests/:publicId` | `point_change_requests.read` | 點數異動申請詳情 | `PointChangeRequestService.getDetail` | 否 |
| `POST` | `/admin/point-change-requests/:publicId/approve` | `point_change_requests.approve` | 核准異動並建立流水帳 | `PointChangeRequestService.approve` | 是 |
| `POST` | `/admin/point-change-requests/:publicId/reject` | `point_change_requests.reject` | 拒絕異動申請 | `PointChangeRequestService.reject` | 是 |
| `GET` | `/admin/applications` | `applications.all.list` | 所有申請列表 | `AdminApplicationService.listApplications` | 否 |
| `GET` | `/admin/applications/:publicId` | `applications.all.read` | 申請詳情 | `AdminApplicationService.getApplicationDetail` | 否 |
| `GET` | `/admin/applications/:publicId/review-actions` | `application_review_actions.read` | 審核操作紀錄 | `AdminApplicationService.listReviewActions` | 否 |
| `GET` | `/admin/applications/:publicId/attachments/:attachmentPublicId` | `applications.attachments.read` | 讀取申請附件 | `PrivateFileService.getApplicationAttachment` | 否 |
| `GET` | `/admin/applications/:publicId/signature` | `applications.signatures.read` | 讀取申請目前版本的有效指導老師簽名 | `PrivateFileService.getApplicationAdvisorSignature` | 否 |
| `GET` | `/admin/student-point-transactions` | `student_point_transactions.read` | 學生點數流水帳查詢 | `StudentPointTransactionService.listTransactions` | 否 |
| `GET` | `/admin/audit-logs` | `audit_logs.read` | 通用系統稽核紀錄列表 | `AuditLogService.listAuditLogs` | 否 |
| `GET` | `/admin/audit-logs/:auditLogId` | `audit_logs.read` | 通用系統稽核紀錄詳情 | `AuditLogService.getAuditLog` | 否 |
| `GET` | `/admin/email-tasks` | `email_tasks.read` | Email 任務列表，第一版主要用於查看 failed tasks | `EmailTaskAdminService.listEmailTasks` | 否 |
| `GET` | `/admin/email-tasks/:emailTaskId` | `email_tasks.read` | Email 任務詳情 | `EmailTaskAdminService.getEmailTask` | 否 |
| `POST` | `/admin/email-tasks/:emailTaskId/retry` | `email_tasks.retry` | 手動重寄 failed email task，建立新的 email task | `EmailTaskAdminService.retryFailedTask` | 是 |

管理員異動使用者、老師、主任、點數規則與手動重寄 failed email task 時，Service 應依 [通用系統稽核紀錄](audit-logs.md) 建立 `audit_logs`。管理員讀取附件、簽名等敏感檔案時，也應建立對應查看紀錄。

## 私有檔案 API

附件與簽名不提供公開靜態網址。所有檔案讀取都必須經過權限檢查與資料範圍檢查。

Service 必須回傳檔案 stream、content type、原始檔名或下載檔名。Controller 只負責設定 HTTP header 與串流回應。

檔案 storage adapter、`storage_key`、上傳驗證與串流回應規則請參考 [私有檔案儲存設計](file-storage.md)。

## Repository 分組建議

| Repository | 負責資料 |
| --- | --- |
| `UserRepository` | `users` |
| `AdvisorRepository` | `advisors` |
| `ApplicationRepository` | `point_applications` 與申請列表查詢 |
| `ApplicationVersionRepository` | `application_versions` |
| `ApplicationParticipantRepository` | `application_participants` |
| `ApplicationDetailRepository` | 四種申請類型專屬資料表 |
| `ApplicationAttachmentRepository` | `application_attachments` |
| `ApplicationReviewActionRepository` | `application_review_actions` |
| `AdvisorSignatureRepository` | `advisor_signatures` |
| `PointRuleRepository` | 四種點數規則表 |
| `StudentPointTransactionRepository` | `student_point_transactions` 與 `student_points_summary` |
| `PointChangeRequestRepository` | `student_point_change_requests` |
| `EmailTaskRepository` | `email_tasks` |
| `AuditLogRepository` | `audit_logs` |

Repository function 應接收 database client 或 transaction client，讓 Service 可以在同一個 Transaction 中呼叫多個 Repository。

第一版實作慣例：

- `src/db/pool.ts` 匯出 PostgreSQL `pool`、`DatabaseClient` 型別與 `closePool()`。
- 不提供全域 `query()` helper 作為 Repository 的查詢入口，避免 Repository 繞過 Service 管理的 Transaction。
- Repository 不直接 import `pool`；Repository function 應以 `db: DatabaseClient` 作為參數，並使用 `db.query(...)` 執行 SQL。
- Service 層決定傳入一般 `pool` 或 `withTransaction(...)` 提供的 transaction client。
- 只有啟動檢查、維運 script 或極少數不進 Repository 的基礎工具可直接使用 `pool`。

## 需 Transaction 的 Service

| Service 操作 | 主要鎖定資料 |
| --- | --- |
| `submitApplication` | 新增資料為主；需保證同一申請建立流程完整提交 |
| `resubmitApplication` | `point_applications FOR UPDATE` |
| `AdvisorApplicationService.approve` | `point_applications FOR UPDATE` |
| `AdvisorApplicationService.reject` | `point_applications FOR UPDATE` |
| `requestRevision` | `point_applications FOR UPDATE` |
| `adjustBeforeApproval` | `point_applications FOR UPDATE` |
| `ReviewerApplicationService.approve` | `point_applications FOR UPDATE`，證照類需鎖定學生既有點數查詢範圍或使用等效併發保護 |
| `ReviewerApplicationService.reject` | `point_applications FOR UPDATE` |
| `PointChangeRequestService.create` | 目標 `student_point_transactions` 與 pending change request 檢查 |
| `PointChangeRequestService.approve` | `student_point_change_requests FOR UPDATE` |
| `PointRuleAdminService.createRuleVersion` | 對同類規則有效期間做重疊檢查，並依 exclusion constraint 作最終保護 |
| `AdvisorAdminService.assignDirector` | 目前主任與新主任資料列 |
| `UserAdminService` 寫入操作 | 目標 `users`，管理員移交需鎖定新舊管理員 |

完整鎖定策略與併發細節會在 Transaction 與併發控制文件中展開。

## 尚待細化

- Auth API 需依 [登入、Session 與安全設計](auth-session-security.md) 實作 session、cookie、CSRF 與 rate limit。
- 本文件不是 OpenAPI 規格；request / response 第一版欄位已整理於 [API Request / Response Schema](api-schemas.md)，實作時仍可再轉成正式 OpenAPI。
