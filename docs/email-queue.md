# Email Queue 與通知排程

本文件定義第一版 Email 任務佇列、通知模板、事件識別、worker 行為、重試策略，以及通知失敗與申請作廢的界線。資料表欄位請參考 [資料模型 - email_tasks](data-model.md#email-寄送任務-email_tasks) 與 [資料庫 Schema](database-schema.md#email_tasks)。

## 設計目標

- 所有 Email 由 `email_tasks` 建立任務，再由背景 worker 寄送。
- 主流程只負責建立通知任務，不在 HTTP request 中直接寄信。
- Email 任務與主流程狀態變更在同一個 Transaction 中建立。
- 寄信失敗重試與申請逾期作廢是不同流程。
- `event_key` 必須穩定且唯一，避免同一通知重複建立。
- Email 永久失敗不直接讓申請作廢，必須另外通知管理員處理。

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
| `revision_extended` | 補件期限延長通知 |
| `revision_reminder` | 補件到期前提醒 |
| `revision_expired` | 補件逾期作廢通知 |
| `application_approved` | 申請核准通知 |
| `application_rejected` | 申請拒絕通知 |
| `point_change_request_created` | 第二版：承辦人建立點數異動申請後通知管理員 |
| `point_change_request_approved` | 第二版：點數異動申請核准通知 |
| `point_change_request_rejected` | 第二版：點數異動申請拒絕通知 |
| `email_delivery_failed` | Email 永久失敗通知管理員 |

`template_payload` 使用 `JSONB` 保存模板資料。Payload 不應保存密碼、原始 token hash 或其他不需要出現在信件中的敏感資料。

### Auth Email Payload

第一版 account activation 與 password reset email task 採用以下方案。

1. Payload 保存完整 URL

   由建立 email task 的 Service 使用 `FRONTEND_URL` 組好完整 URL，worker 只負責依 `template_name` render 與寄送，不再重新推導前端路徑。

2. Account activation payload

   建議欄位：

   ```json
   {
     "activationUrl": "https://example.edu/auth/activation/raw-token",
     "expiresAt": "2026-07-14T12:00:00.000+08:00",
     "displayName": "王小明"
   }
   ```

3. Password reset payload

   建議欄位：

   ```json
   {
     "resetUrl": "https://example.edu/auth/password-reset/raw-token",
     "expiresAt": "2026-07-13T12:30:00.000+08:00",
     "displayName": "王小明"
   }
   ```

4. 不保存 token hash 或密碼資訊

   Payload 可以包含原始 token URL，因為 email 本身必須提供連結；但不得保存 token hash、password hash、密碼、session token、CSRF token 或其他不需要出現在信件中的敏感資料。

5. Event key

   Account activation 重寄與 password reset 允許再次建立新任務，`event_key` 必須包含時間戳或 token version，避免與舊任務衝突。

6. Provider 邊界

   Phase 4.3 完成 template mapping、URL、payload 與 Email task 建立，並使用 Phase 4.2 的可注入 fake provider 驗證流程。正式 Email provider 的服務選型與 worker 維運整合留在 Phase 10。

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
revision-extended:application-100:version-3:20260715102030
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

## Email Worker / Retry 待確認方案

以下為第一版 email worker 與 retry 的建議方案，實作前可逐項確認。

### Provider 介面與實作階段邊界

- Service 與 worker 只依賴 `EmailProvider` interface，不直接呼叫 Gmail、SMTP、SendGrid 或其他特定服務。不同服務以 adapter 將統一的寄送輸入與錯誤分類轉換成各 provider API；更換 provider 時不修改 queue、claim 或 retry 核心流程。
- Phase 4.2 使用 fake renderer 與 fake provider 驗證寄送成功、可重試失敗及永久失敗，不需要外部網路或正式 credential。實際 provider、寄件者與 reply-to 確認後，再新增對應 production adapter。
- Phase 4.2 實作可單次呼叫的 worker function、`pending -> processing -> sent` 與有限重試狀態轉換，不在 server 啟動時掛入常駐排程。
- `email_delivery_failed` 永久失敗通知、stale `processing` task maintenance，以及 worker 啟動、停止與健康狀態整合留在 Phase 10。Phase 4.2 仍須將達上限或不可重試的原任務正確標記為 `failed`，不得直接改變申請狀態。
- 相同 `event_key` 會比較收件人、模板、payload、申請關聯與重試上限等不可變業務欄位；內容一致時採冪等成功並回傳既有 task，內容不一致時視為程式錯誤且不得覆蓋原 task。`scheduled_at`、status、嘗試次數與錯誤等可變 delivery 狀態不納入比較。
- 成功寄送時保留既有 `attempt_count` 並清除 `last_error`。Renderer／payload 錯誤與 provider 明確永久錯誤不可重試；timeout、rate limit、network、provider 5xx 與無法辨識的 provider 錯誤預設可重試。
- 單次 worker 預設最多處理 `10` 筆，每次只 claim 一筆並完成寄送與狀態更新後才 claim 下一筆，避免一次 claim 多筆後 process 中斷造成大量 task 卡在 `processing`。

1. Worker claim 策略

   Worker 從 `email_tasks` claim `status = 'pending'` 且 `scheduled_at <= NOW()` 的任務，將狀態改為 `processing` 後再寄送。Claim 必須避免多個 worker 同時處理同一筆任務。

2. 成功寄送

   寄送成功後更新：

   - `status = 'sent'`
   - `sent_at = NOW()`
   - 保留 `attempt_count` 並清除 `last_error`。

3. 可重試失敗

   可重試錯誤增加 `attempt_count`，依退避策略更新 `scheduled_at`，狀態回到 `pending`。若達 `max_attempts`，狀態改為 `failed`。

4. 不可重試失敗

   不可重試錯誤直接標記 `failed`，保存安全摘要到 `last_error`，不得保存 provider 回傳中的敏感內容。

5. 手動 retry（第二版）

   第一版不提供 Email task 管理 API。第二版管理員手動 retry failed task 時，不修改原 failed task，而是建立新的 `email_tasks`，並在 payload 或 metadata 中記錄 `retryOfEmailTaskId`。

6. Stale processing maintenance

   對長時間停留在 `processing` 的任務，需有 maintenance job 依安全規則重排或標記 failed，避免 worker crash 後任務永久卡住；此維運能力依實作計畫留在 Phase 10。

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
| 承辦人延長補件期限 | `revision_extended`，並依新期限重新安排尚未寄出的 `revision_reminder` |
| 承辦人核准 | `application_approved` |
| 承辦人拒絕 | `application_rejected` |
| 指導老師簽核逾期作廢 | `advisor_confirmation_expired` |
| 申請人補件逾期作廢 | `revision_expired` |
| 第二版：承辦人建立點數異動申請 | `point_change_request_created` |
| 第二版：管理員核准點數異動申請 | `point_change_request_approved` |
| 第二版：管理員拒絕點數異動申請 | `point_change_request_rejected` |
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

承辦人延長補件期限時，系統應建立 `revision_extended` 通知申請人。若既有 `revision_reminder` 尚未寄出，應取消舊提醒並依新的 `edit_token_expires_at` 重新建立提醒；已寄出的提醒保留歷史紀錄，不修改。

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

Email task 進入 `failed` 後，不應直接改變申請狀態。

若失敗任務與申請相關，系統應建立 `email_delivery_failed` 通知給管理員。該通知本身也使用 `email_tasks`，但必須避免無限遞迴：

- `email_delivery_failed` 任務若也失敗，不再建立新的 `email_delivery_failed`。
- 第二版管理後台提供 admin-only failed email tasks 查詢與手動重寄入口。

第二版 Email task 管理操作：

- 管理員可查詢 `failed` email tasks。
- 管理員可手動重寄 `failed` email task。
- 手動重寄不修改原本 `failed` task，而是建立新的 `email_tasks`，保留原本失敗紀錄。
- 新 task 應在 `template_payload` 或 metadata 中記錄來源，例如 `retryOfEmailTaskId`。
- 手動重寄必須建立 `email_task.retry_requested` 通用稽核紀錄。
- `email_delivery_failed` 本身若為 `failed`，管理員可以手動重寄；但自動永久失敗通知機制不得再為它建立新的 `email_delivery_failed`。

## 通知失敗與申請作廢政策

Email 寄送失敗不會直接讓申請作廢，也不會自動延長期限。

若第一封正式通知未成功送達，例如指導老師簽核通知或申請人補件通知永久失敗，系統不應直接將後續未處理責任歸給指導老師或申請人。第一版不自動補償或重算期限，而是建立 `email_delivery_failed` 通知管理員人工判斷；管理員可在系統外聯絡當事人或依行政程序處理。Email task 查詢與系統內手動重寄延後到第二版。

期限判斷依資料表欄位：

- 指導老師簽核期限：`point_applications.advisor_confirmation_expires_at`
- 補件期限：`point_applications.edit_token_expires_at`

逾期作廢由排程任務依申請狀態與期限欄位判斷，並使用 [Transaction 與併發控制](transaction-concurrency.md#背景任務與人工操作衝突) 中定義的鎖定策略。

政策：

- 已成功通知但使用者未處理：逾期後作廢。
- 通知永久失敗：通知管理員人工處理，不直接作廢，也不視為老師或申請人已收到通知但未處理。
- 若因 Email 無法寄達而需要特殊處理，第一版先由人工聯絡或要求申請人重新申請；不得直接更新 Email task 或申請狀態繞過正式流程。

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
- 第二版管理後台 failed email tasks 列表欄位、操作文案與手動重寄確認流程。
- provider message id 是否需要新增欄位保存。
