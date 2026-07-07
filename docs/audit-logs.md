# 通用系統稽核紀錄

本文件定義第一版 `audit_logs` 的用途、資料語意、必記錄事件、查詢權限與敏感資料規則。申請審核流程專用紀錄仍使用 `application_review_actions`；本文件聚焦帳號、教師、規則、敏感檔案、維運與其他跨模組管理操作。

## 設計目標

- 記錄誰在什麼時間、從什麼來源，對哪個資源執行了哪個重要操作。
- 補足 `application_review_actions` 無法涵蓋的帳號、教師、規則、檔案查看與維運操作。
- 支援管理員事後查詢安全事件與敏感資料存取紀錄。
- 稽核紀錄不可由一般 API 修改或刪除。
- 不在稽核紀錄中保存密碼、原始 token、token hash、session token、CSRF token、附件內容或簽名內容。

## 與 `application_review_actions` 的分工

| 紀錄 | 用途 |
| --- | --- |
| `application_review_actions` | 一般申請流程中的狀態轉換與審核決定，例如老師同意、老師拒絕、承辦人要求補件、承辦人核准或拒絕、逾期作廢 |
| `audit_logs` | 跨模組安全與管理操作，例如帳號管理、教師管理、主任異動、點數規則管理、敏感檔案查看、管理員移交與維運指令 |

若同一個操作同時具有申請流程意義與系統安全意義，可以同時寫入兩種紀錄。例如管理員查看簽名只寫 `audit_logs`；承辦人核准申請只寫 `application_review_actions`；若未來管理員強制介入申請流程，則可視操作同時寫入兩者。

## 欄位語意

正式欄位與 SQL 請參考 [資料模型 - audit_logs](data-model.md#通用系統稽核紀錄-audit_logs) 與 [資料庫 Schema - audit_logs](database-schema.md#audit_logs)。

核心語意：

- `actor_type` 表示操作來源，第一版允許 `user`、`system`、`maintenance`。
- `actor_user_id` 僅在 `actor_type = 'user'` 時必填，關聯 `users.id`。
- `action` 使用穩定字串，表示發生的操作。
- `resource_type` 使用穩定字串，表示被操作的資源類型。
- `resource_id` 保存被操作資源的內部 `BIGINT id`；若操作沒有單一資料列目標，可為 `NULL`。
- `resource_public_id` 保存對外 UUID，僅適用有 `public_id` 的資源。
- `metadata` 保存不敏感的輔助資訊，例如變更前後狀態、原因摘要、錯誤代碼或維運指令名稱。
- `ip_address` 與 `user_agent` 記錄使用者請求來源；系統背景任務或維運指令可為 `NULL`。

## 必須記錄的操作

第一版至少記錄以下操作。

帳號：

- `user.created`
- `user.updated`
- `user.activated`
- `user.deactivated`
- `user.activation_resent`
- `user.password_reset_sent`
- `user.password_reset_completed`
- `user.sessions_revoked`
- `admin.transferred`
- `admin.recovered`

指導老師：

- `advisor.created`
- `advisor.updated`
- `advisor.activated`
- `advisor.deactivated`
- `advisor.director_assigned`

點數規則：

- `point_rule.created`
- `point_rule.deactivated`

敏感檔案：

- `application_attachment.viewed`
- `advisor_signature.viewed`

點數異動：

- `point_change_request.created`
- `point_change_request.approved`
- `point_change_request.rejected`

維運與背景任務：

- `maintenance.admin_created`
- `maintenance.admin_recovered`
- `system.expired_applications_processed`
- `system.email_task_failed_permanently`

## `resource_type` 固定值

第一版建議固定以下 `resource_type`：

| `resource_type` | 對應資料 |
| --- | --- |
| `user` | `users` |
| `advisor` | `advisors` |
| `point_rule` | 四種點數規則表 |
| `point_application` | `point_applications` |
| `application_attachment` | `application_attachments` |
| `advisor_signature` | `advisor_signatures` |
| `student_point_change_request` | `student_point_change_requests` |
| `student_point_transaction` | `student_point_transactions` |
| `email_task` | `email_tasks` |
| `maintenance_command` | 維運指令 |
| `system_job` | 背景任務 |

不同點數規則表共用 `point_rule`，實際規則種類可放在 `metadata.rule_type`，例如 `competition`、`project`、`certificate`、`exhibition`。

## Metadata 規則

`metadata` 使用 `JSONB`，只保存稽核需要且不敏感的資料。

可以保存：

- `reason`：管理員或承辦人的原因摘要。
- `previous_status`、`new_status`。
- `previous_role`、`new_role`。
- `previous_is_active`、`new_is_active`。
- `previous_director_advisor_id`、`new_director_advisor_id`。
- `rule_type`、`effective_from`、`effective_to`。
- `application_public_id`、`attachment_public_id`。
- `error_code`。
- `command_name`。

不得保存：

- 密碼或密碼雜湊。
- 原始 activation token、password reset token、edit token、session token、CSRF token。
- token hash。
- 簽名檔案內容、附件檔案內容或完整 storage key。
- SQL error 原文或 stack trace。
- 不必要的完整電話、完整姓名或完整學號；若需要追蹤，優先保存遮罩值或內部資源 id。

## Actor 規則

使用者操作：

- `actor_type = 'user'`
- `actor_user_id` 必填。
- `ip_address` 與 `user_agent` 盡量必填，由 HTTP request 來源提供。

系統背景任務：

- `actor_type = 'system'`
- `actor_user_id = NULL`
- `ip_address = NULL`
- `user_agent = NULL`
- `metadata.job_name` 保存任務名稱。

維運指令：

- `actor_type = 'maintenance'`
- `actor_user_id` 可為 `NULL`。
- `metadata.command_name` 保存指令名稱。
- 若維運指令可取得執行者資訊，可放在 `metadata.operator`，但不保存機密憑證。

## 寫入時機與 Transaction

Service 應在同一個業務 Transaction 中寫入 `audit_logs`。

範例：

```text
管理員停用使用者 Transaction:
1. 鎖定 users 目標資料列
2. 更新 users.is_active = false
3. 撤銷該使用者有效 session
4. 建立 user.deactivated audit log
5. commit
```

若主要操作 rollback，對應稽核紀錄也應 rollback，避免留下沒有實際發生的紀錄。

背景 worker 若需要記錄永久失敗事件，應在更新主要資料與建立 `audit_logs` 時使用同一個 Transaction。

## 查詢權限

第一版只允許管理員查詢 `audit_logs`。

建議 API：

```text
GET /admin/audit-logs
GET /admin/audit-logs/:auditLogId
```

查詢條件：

- `actorUserId`
- `actorType`
- `action`
- `resourceType`
- `resourceId`
- `createdFrom`
- `createdTo`

List API 必須分頁，並依 `created_at DESC, id DESC` 排序。

管理員查詢 `audit_logs` 本身不需要再寫一筆 audit log；若未來有大量敏感稽核查閱需求，再評估加入 `audit_log.viewed`。

## 保存期限

第一版建議長期保存 `audit_logs`，不提供一般管理後台刪除功能。

若未來資料量增加，可再評估：

- 依年度封存舊紀錄。
- 匯出到冷儲存。
- 保留線上查詢最近數年紀錄。

在尚未有明確法規或校內保存期限前，不建議自動刪除安全稽核紀錄。

## Repository 與 Service

建議新增：

```text
AuditLogRepository
AuditLogService
```

分工如下：

- 業務 Service 負責決定何時需要建立稽核紀錄，例如管理員停用使用者、異動指導老師、查看敏感檔案或切換點數規則。
- `AuditLogService` 負責把稽核內容整理成一致格式，包含 `actor_type`、`actor_user_id`、`action`、`resource_type`、`resource_id`、`resource_public_id`、`metadata`、`ip_address` 與 `user_agent`。
- `AuditLogService` 必須在寫入前移除或遮罩敏感資料，例如密碼、原始 token、token hash、session token、CSRF token、附件內容與完整 storage key。
- `AuditLogRepository` 只負責 `audit_logs` 的 `INSERT` 與查詢 SQL，不判斷業務語意，不讀取 HTTP context，也不自行開啟 Transaction。

典型流程：

```text
AdminUserService.deactivateUser()
  1. 在同一個 Transaction 中停用 users 目標資料列
  2. 撤銷該使用者有效 session
  3. 呼叫 AuditLogService.record(...)
  4. AuditLogService 整理與清理 metadata
  5. AuditLogRepository.insert(...) 寫入 audit_logs
  6. commit
```

其他 Service 呼叫 `AuditLogService` 時，應傳入目前業務流程正在使用的 transaction client。這能確保主要操作與 `audit_logs` 一起 commit 或一起 rollback。
