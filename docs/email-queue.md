# Email Queue 與通知排程

本文件定義第一版 Email 任務佇列、通知模板、事件識別、worker 行為、重試策略，以及通知失敗與申請作廢的界線。資料表欄位請參考 [資料模型 - email_tasks](data-model.md#email-寄送任務-email_tasks) 與 [資料庫 Schema](database-schema.md#email_tasks)。

## 設計目標

- 所有 Email 由 `email_tasks` 建立任務，再由背景 worker 寄送。
- 主流程只負責建立通知任務，不在 HTTP request 中直接寄信。
- Email 任務與主流程狀態變更在同一個 Transaction 中建立。
- 寄信失敗重試與申請逾期作廢是不同流程。
- `event_key` 必須穩定且唯一，避免同一通知重複建立。
- Email 永久失敗不直接讓申請作廢，必須另外通知承辦人或管理員處理。

## 任務狀態

| 狀態 | 說明 |
| --- | --- |
| `pending` | 等待 worker 寄送 |
| `processing` | worker 已取得任務，正在寄送 |
| `sent` | 已成功寄出 |
| `failed` | 已達最大嘗試次數，或錯誤被判定不可重試 |
| `cancelled` | 事件已不需要寄送 |

狀態轉換：

```text
pending -> processing -> sent
pending -> processing -> pending
pending -> processing -> failed
pending -> cancelled
processing -> failed
```

`sent`、`failed` 與 `cancelled` 為終止狀態，不應再被 worker claim。

## Template 名稱

第一版建議固定以下 `template_name`：

| `template_name` | 用途 |
| --- | --- |
| `account_activation` | 帳號啟用 |
| `password_reset` | 密碼重設 |
| `admin_recovery` | 管理員帳號復原 |
| `advisor_sign_request` | 指導老師簽核通知 |
| `advisor_sign_reminder_1` | 指導老師第一次提醒 |
| `advisor_sign_reminder_2` | 指導老師第二次提醒 |
| `advisor_sign_reminder_3` | 指導老師第三次提醒 |
| `advisor_confirmation_expired` | 指導老師逾期未簽核作廢通知 |
| `revision_request` | 補件通知 |
| `revision_reminder` | 補件到期前提醒 |
| `revision_expired` | 補件逾期作廢通知 |
| `application_approved` | 申請核准通知 |
| `application_rejected` | 申請拒絕通知 |
| `point_change_request_created` | 承辦人建立點數異動申請後通知管理員 |
| `point_change_request_approved` | 點數異動申請核准通知 |
| `point_change_request_rejected` | 點數異動申請拒絕通知 |
| `email_delivery_failed` | Email 永久失敗通知承辦人或管理員 |

`template_payload` 使用 `JSONB` 保存模板資料。Payload 不應保存密碼、原始 token hash 或其他不需要出現在信件中的敏感資料。

## Event Key 規則

`event_key` 用來保證同一通知事件只建立一次。

`template_name` 使用底線命名；`event_key` 使用 dash 命名，方便閱讀與放入 log。兩者不需要完全相同。

建議格式：

```text
{template}:{resource}:{resource-id}:{scope}
```

範例：

```text
account-activation:user-10
password-reset:user-10:20260704120000
advisor-sign-request:application-100:version-2
advisor-sign-reminder-1:application-100:version-2
advisor-sign-reminder-2:application-100:version-2
advisor-sign-reminder-3:application-100:version-2
advisor-confirmation-expired:application-100:version-2
revision-request:application-100:version-3
revision-reminder:application-100:version-3
revision-expired:application-100:version-3
application-approved:application-100
application-rejected:application-100
point-change-request-created:request-50
point-change-request-approved:request-50
point-change-request-rejected:request-50
email-delivery-failed:email-task-500
```

若同一類通知允許再次寄送，例如管理員手動重寄啟用信，`event_key` 必須加入新的時間戳或 token version，避免和舊任務衝突。

## 建立任務時機

| 流程 | 建立的 Email 任務 |
| --- | --- |
| 管理員建立帳號 | `account_activation` |
| 管理員重寄啟用信 | `account_activation`，使用新的 event key |
| 使用者要求密碼重設 | `password_reset` |
| 建立申請 | `advisor_sign_request` 與三次 `advisor_sign_reminder_*` |
| 補件重新提交 | 新版本的 `advisor_sign_request` 與三次 `advisor_sign_reminder_*` |
| 指導老師拒絕 | `application_rejected` |
| 承辦人要求補件 | `revision_request` 與 `revision_reminder` |
| 承辦人核准 | `application_approved` |
| 承辦人拒絕 | `application_rejected` |
| 指導老師簽核逾期作廢 | `advisor_confirmation_expired` |
| 申請人補件逾期作廢 | `revision_expired` |
| 承辦人建立點數異動申請 | `point_change_request_created` |
| 管理員核准點數異動申請 | `point_change_request_approved` |
| 管理員拒絕點數異動申請 | `point_change_request_rejected` |
| Email 永久失敗 | `email_delivery_failed` |

## 提醒排程

### 指導老師簽核提醒

`advisor_confirmation_expires_at` 是簽核最後期限，不是提醒時間。

第一版建議：

- 簽核通知：申請建立或補件重新提交後立即排程。
- 第一次提醒：期限前 `72` 小時。
- 第二次提醒：期限前 `24` 小時。
- 第三次提醒：期限前 `4` 小時。

若提醒時間已經早於目前時間，不建立該提醒任務。所有提醒的 `scheduled_at` 必須早於 `advisor_confirmation_expires_at`。

### 申請人補件提醒

補件期限為 `7` 天。

第一版建議：

- 補件通知：承辦人要求補件後立即排程。
- 補件提醒：`edit_token_expires_at` 前 `24` 小時。

若提醒時間已經早於目前時間，不建立提醒任務。

## Worker Claim 策略

Worker 只處理：

```text
status = 'pending'
scheduled_at <= NOW()
```

建議使用 `FOR UPDATE SKIP LOCKED`，避免多個 worker claim 同一任務：

```sql
WITH next_task AS (
  SELECT id
  FROM email_tasks
  WHERE status = 'pending'
    AND scheduled_at <= NOW()
  ORDER BY scheduled_at ASC, id ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE email_tasks
SET status = 'processing',
    updated_at = NOW()
WHERE id IN (SELECT id FROM next_task)
RETURNING *;
```

Worker claim 任務後才呼叫 Email provider。若 process 在 `processing` 狀態中斷，需由重置排程處理 stale processing tasks。

## 寄送成功

寄送成功時：

```text
status = sent
sent_at = NOW()
last_error = NULL
```

若 provider 回傳 message id，第一版可放在 `template_payload` 或未來新增欄位；目前 schema 不強制保存。

## 寄送失敗與重試

寄送失敗時，worker 必須：

1. 增加 `attempt_count`。
2. 寫入 `last_error`。
3. 判斷是否可重試。
4. 若可重試且未達 `max_attempts`，改回 `pending` 並設定下一次 `scheduled_at`。
5. 若不可重試或已達 `max_attempts`，改為 `failed`。

第一版預設：

```text
max_attempts = 5
```

重試間隔建議：

| `attempt_count` | 下一次重試 |
| --- | --- |
| `1` | 5 分鐘後 |
| `2` | 15 分鐘後 |
| `3` | 1 小時後 |
| `4` | 6 小時後 |
| `5` | 標記 `failed` |

不可重試錯誤範例：

- Email address 被 provider 判定格式無效。
- 收件網域不存在。
- provider 明確回報永久退信。

可重試錯誤範例：

- provider timeout。
- network error。
- rate limit。
- provider 5xx。

## Stale Processing 任務

若 worker claim 後 process crash，任務可能停在 `processing`。

第一版建議建立 worker maintenance job：

- 查詢 `status = 'processing'` 且 `updated_at < NOW() - INTERVAL '15 minutes'`。
- 若 `attempt_count < max_attempts`，改回 `pending` 並增加 `attempt_count`。
- 若已達上限，改為 `failed`。

此維護操作應記錄 `last_error = 'processing task timed out'` 或等價訊息。

## 永久失敗通知

任務進入 `failed` 後，不應直接改變申請狀態。

若失敗任務與申請相關，系統應建立 `email_delivery_failed` 通知給承辦人或管理員。該通知本身也使用 `email_tasks`，但必須避免無限遞迴：

- `email_delivery_failed` 任務若也失敗，不再建立新的 `email_delivery_failed`。
- 管理後台應可查詢 failed email tasks，作為人工處理入口。

第一版若尚未有管理後台 failed email list，可先記錄 failed 狀態與 log，並在後續管理功能補查詢。

## 通知失敗與申請作廢政策

Email 寄送失敗不會直接讓申請作廢，也不會自動延長期限。

期限判斷依資料表欄位：

- 指導老師簽核期限：`point_applications.advisor_confirmation_expires_at`
- 補件期限：`point_applications.edit_token_expires_at`

逾期作廢由排程任務依申請狀態與期限欄位判斷，並使用 [Transaction 與併發控制](transaction-concurrency.md#背景任務與人工操作衝突) 中定義的鎖定策略。

政策：

- 已成功通知但使用者未處理：逾期後作廢。
- 通知永久失敗：通知承辦人或管理員人工處理，不直接作廢。
- 若因 Email 無法寄達而需要特殊處理，第一版先由人工重新寄送或要求申請人重新申請。

## 取消任務

當事件已不需要寄送時，Service 可將尚未寄出的任務改為 `cancelled`。

常見情境：

- 指導老師已簽名，尚未寄出的簽核提醒取消。
- 指導老師已拒絕，尚未寄出的簽核提醒取消。
- 申請人已完成補件，尚未寄出的補件提醒取消。
- 申請已進入終止狀態，相關未寄提醒取消。

`sent` 任務不可取消，只能保留歷史。

## 與 Transaction 的關係

Service 在主流程 Transaction 中建立或取消 email tasks。

範例：

```text
承辦人要求補件 Transaction:
1. 鎖定 point_applications
2. 更新狀態為 needs_revision
3. 寫入 edit_token_hash / edit_token_expires_at
4. 建立 revision_requested 審核紀錄
5. 建立 revision_request 與 revision_reminder email_tasks
6. commit
```

Worker 只能在 commit 後看到 pending 任務，因此不會寄出 rollback 的通知。

## 尚待實作時確認

- Email provider，例如 SMTP、SendGrid、Mailgun 或學校信件服務。
- 寄件者名稱與 reply-to。
- Email template 實際 subject 與 HTML/text 內容。
- 管理後台是否提供 failed email tasks 列表與手動重寄。
- provider message id 是否需要新增欄位保存。
