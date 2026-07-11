# Transaction 與併發控制

本文件定義第一版重要寫入流程的 PostgreSQL Transaction 邊界、資料列鎖定策略與併發衝突處理。API 與 Service 分工請參考 [API 與 Service 邊界](api-service-boundaries.md)，資料表與 Constraint 請參考 [資料庫 Schema](database-schema.md)。

## 通用原則

- Transaction 由 Service 開啟與提交，Controller 不直接控制 Transaction。
- Repository function 必須可接收一般 database client 或 transaction client。
- Repository 不直接 import 全域 `pool` 或全域 `query()` helper；Service 需明確傳入 `pool` 或 transaction client。
- 進入 Transaction 前，先完成 Zod 格式驗證與基本欄位驗證。
- 進入 Transaction 後，必須重新讀取目標資料並檢查最新狀態。
- 最終寫入流程使用短時間 Transaction；不在使用者閱讀、填表或上傳前端暫存期間持有資料庫鎖。
- 任一步驟失敗都必須 rollback，不可留下半完成狀態。
- Email 任務與主流程狀態變更應在同一個 Transaction 中建立；實際寄送由 worker 在 commit 後處理。
- PostgreSQL Constraint 與 unique index 是最後防線；Service 應先檢查並回傳可讀錯誤，但仍要處理資料庫衝突。

## 鎖定與衝突回應

常用鎖定：

```sql
SELECT *
FROM point_applications
WHERE id = $1
FOR UPDATE;
```

常用衝突回應：

| 情境 | 建議 HTTP status | `code` |
| --- | --- | --- |
| 申請狀態已被其他人改變 | `409` | `application_status_conflict` |
| 申請版本已不是使用者看到的版本 | `409` | `application_version_conflict` |
| 指導老師簽核已逾期 | `409` | `advisor_confirmation_expired` |
| 補件 token 已失效或已被使用 | `409` | `revision_token_invalid` |
| 點數異動申請已被處理 | `409` | `point_change_request_status_conflict` |
| 規則有效期間與既有規則重疊 | `409` | `point_rule_period_overlap` |
| 證照點數核准後會超過上限 | `400` | `certificate_points_limit_exceeded` |

## 建立申請

Service：`ApplicationSubmissionService.submitApplication`

Transaction 內步驟：

1. 查詢送件日期適用的點數規則。
2. 驗證申請人是參與者之一。
3. 計算參與者申請點數與 `requested_total_points`。
4. 建立 `point_applications`，`current_version_id` 暫時為 `NULL`。
5. 建立申請類型專屬資料。
6. 建立 `application_participants`。
7. 建立 `application_versions` 第一版快照。
8. 更新 `point_applications.current_version_id`。
9. 產生附件 `storage_key` 並寫入私有檔案儲存。
10. 建立附件 metadata。
11. 建立老師簽核通知與提醒 `email_tasks`。

鎖定策略：

- 新增資料為主，通常不需要鎖定既有申請。
- 點數規則查詢不鎖定；已提交申請保存規則 id，後續規則異動不回寫舊申請。

一致性要求：

- `point_applications.current_version_id` 不可在 commit 後仍為 `NULL`。
- 任何一步失敗都 rollback。
- 若檔案已寫入但資料庫 Transaction 失敗，Service 必須清理本次新寫入的檔案；完整規則請參考 [私有檔案儲存設計](file-storage.md)。

## 補件重新提交

Service：`RevisionService.resubmitApplication`

Transaction 內步驟：

1. 以 token hash 查詢 `point_applications`。
2. 鎖定目標申請：

```sql
SELECT *
FROM point_applications
WHERE id = $1
FOR UPDATE;
```

3. 驗證狀態仍為 `needs_revision`。
4. 驗證 `edit_token_hash` 與 `edit_token_expires_at` 仍有效。
5. 依補件內容更新目前資料表。
6. 建立新的 `application_versions`。
7. 更新 `current_version_id`。
8. 清除補件 token。
9. 將舊版本有效簽名標記失效。
10. 狀態改回 `pending_advisor`。
11. 建立 `resubmitted` 審核紀錄。
12. 建立新的老師簽核通知與提醒 `email_tasks`。

衝突處理：

- token 已過期、已清除或狀態不是 `needs_revision`：回傳 `revision_token_invalid`。
- 申請已被承辦人或系統改成終止狀態：回傳 `application_status_conflict`。

## 指導老師簽名同意

Service：`AdvisorApplicationService.approve`

Transaction 內步驟：

1. 鎖定 `point_applications`。
2. 驗證狀態仍為 `pending_advisor`。
3. 驗證 `advisor_confirmation_expires_at > NOW()`。
4. 驗證登入使用者對應此申請的 `advisor_id`。
5. 驗證目前版本尚無有效簽名。
6. 產生 `signature_storage_key` 並寫入簽名檔案。
7. 建立 `advisor_signatures`。
8. 建立 `advisor_approved` 審核紀錄。
9. 將申請狀態改為 `under_review`。
10. 建立承辦人待審通知 `email_tasks`（若第一版需要）。

鎖定策略：

- 以 `point_applications FOR UPDATE` 防止簽名與逾期作廢、補件重送或其他狀態變更同時發生。
- `advisor_signatures` 的 partial unique index `one_valid_signature_per_version` 防止同版本重複有效簽名。

衝突處理：

- 已逾期：回傳 `advisor_confirmation_expired`。
- 申請狀態已改變：回傳 `application_status_conflict`。
- 已存在有效簽名：回傳 `application_status_conflict`。
- 若簽名檔案寫入失敗，整個簽核操作不得成立；若資料庫 Transaction 失敗，Service 必須清理本次新寫入的簽名檔案。

## 指導老師拒絕

Service：`AdvisorApplicationService.reject`

Transaction 內步驟：

1. 鎖定 `point_applications`。
2. 驗證狀態仍為 `pending_advisor`。
3. 驗證登入使用者對應此申請的 `advisor_id`。
4. 建立 `advisor_rejected` 審核紀錄。
5. 將申請狀態改為 `rejected`。
6. 寫入 `closed_at`。
7. 建立拒絕通知 `email_tasks`。

老師拒絕不建立 `advisor_signatures`。

## 承辦人要求補件

Service：`ReviewerApplicationService.requestRevision`

Transaction 內步驟：

1. 鎖定 `point_applications`。
2. 驗證狀態仍為 `under_review`。
3. 產生新的補件 token hash 與到期時間。
4. 狀態改為 `needs_revision`。
5. 寫入 `revision_requested` 審核紀錄與原因。
6. 建立補件通知與提醒 `email_tasks`。

衝突處理：

- 申請已被其他承辦人核准或拒絕：回傳 `application_status_conflict`。

## 延長補件期限

Service：`ReviewerApplicationService.extendRevision`

Transaction 內步驟：

1. 鎖定 `point_applications`。
2. 驗證狀態仍為 `needs_revision`。
3. 驗證 `edit_token_hash` 與 `edit_token_expires_at` 仍存在且尚未逾期。
4. 驗證新的 `edit_token_expires_at` 晚於目前時間與原補件期限。
5. 更新 `point_applications.edit_token_expires_at`。
6. 建立 `revision_extended` 審核紀錄，`reason` 必填，`metadata` 保存原期限與新期限。
7. 取消尚未寄出的舊 `revision_reminder`。
8. 依新期限建立新的 `revision_reminder`，並建立 `revision_extended` 通知。

延長期限不重新產生補件 Token。若申請已被背景任務作廢或被人工處理，取得鎖後狀態重驗會失敗並回傳 `application_status_conflict` 或 `revision_token_invalid`。

## 核准前調整

Service：`ReviewerApplicationService.adjustBeforeApproval`

Transaction 內步驟：

1. 鎖定 `point_applications`。
2. 驗證狀態仍為 `under_review`。
3. 驗證調整內容符合申請類型與點數規則。
4. 更新類型專屬資料的核准欄位。
5. 更新 `application_participants.approved_points`。
6. 更新 `point_applications.approved_total_points`。
7. 可選擇建立審核草稿或只保存目前核准欄位；最終核准時仍以 `reviewer_approved` 審核紀錄保存完整調整 metadata。

注意：

- 若調整只是核准前暫存，尚不建立 `student_point_transactions`。
- 若調整與核准同一個 API 完成，可併入承辦人核准流程。

## 承辦人核准申請

Service：`ReviewerApplicationService.approve`

Transaction 內步驟：

1. 鎖定 `point_applications`。
2. 驗證狀態仍為 `under_review`。
3. 驗證目前版本未失效且已有有效老師簽名。
4. 驗證類型專屬資料與參與者核准點數已完成。
5. 驗證 `approved_total_points` 等於所有參與者 `approved_points` 加總。
6. 若為證照申請，執行證照累積上限併發保護。
7. 建立每位參與者的 `student_point_transactions` `award` 紀錄。
8. 將申請狀態改為 `approved`。
9. 寫入 `closed_at`。
10. 建立 `reviewer_approved` 審核紀錄。
11. 建立核准通知 `email_tasks`。

鎖定策略：

- `point_applications FOR UPDATE` 防止多位承辦人重複核准。
- `one_award_per_participant` partial unique index 防止同一參與者重複建立 `award`。

## 證照累積上限併發保護

證照申請核准時，必須避免兩筆不同申請同時核准，導致同一學生證照點數超過上限。

第一版採用 PostgreSQL advisory transaction lock，以學生學號建立鎖 key：

```sql
SELECT pg_advisory_xact_lock(hashtext('certificate-points:' || $1)::bigint);
```

其中 `$1` 為 `student_number`。`certificate-points:` 是證照點數鎖的 namespace，避免和其他 advisory lock 用途混淆。`hashtext(...)::bigint` 將字串 key 轉成 `pg_advisory_xact_lock` 可接受的數字 key。

同一個核准 Transaction 中，對本次申請所有參與者學號依排序後順序取得 advisory lock，避免死鎖：

1. 取出本次證照申請涉及的所有 `student_number`。
2. 依字串排序。
3. 逐一取得 `pg_advisory_xact_lock(hashtext('certificate-points:' || student_number)::bigint)`。
4. 查詢該學生目前 `certificate` 類別累積點數。
5. 驗證加上本次核准點數後不超過 `certificate_point_rules.maximum_points_per_student`。
6. 建立 `student_point_transactions`。

選擇 advisory lock 的原因：

- `student_point_transactions` 是 append-only，沒有學生主資料表可鎖。
- 當學生尚未有任何證照點數紀錄時，無既有資料列可 `FOR UPDATE`。
- advisory transaction lock 會在 transaction 結束時自動釋放。

若未來建立學生主資料表，可改鎖定學生資料列。

## 承辦人拒絕申請

Service：`ReviewerApplicationService.reject`

Transaction 內步驟：

1. 鎖定 `point_applications`。
2. 驗證狀態仍為 `under_review`。
3. 建立 `reviewer_rejected` 審核紀錄與原因。
4. 將申請狀態改為 `rejected`。
5. 寫入 `closed_at`。
6. 建立拒絕通知 `email_tasks`。

## 建立點數異動申請

Service：`PointChangeRequestService.create`

Transaction 內步驟：

1. 鎖定目標 `student_point_transactions`：

```sql
SELECT *
FROM student_point_transactions
WHERE id = $1
FOR UPDATE;
```

2. 驗證目標交易可被異動。
3. 驗證同一目標交易不存在 pending 異動申請。
4. 驗證 requested points 不為 `0`，且符合 adjustment/reversal 規則。
5. 建立 `student_point_change_requests`。

資料庫 `one_pending_change_per_transaction` partial unique index 是最後防線。

## 管理員核准點數異動

Service：`PointChangeRequestService.approve`

Transaction 內步驟：

1. 鎖定 `student_point_change_requests`。
2. 驗證狀態仍為 `pending`.
3. 鎖定目標 `student_point_transactions`。
4. 重新計算目標學生與類別目前點數。
5. 驗證 adjustment 後不會低於 `0`。
6. 若為 reversal，驗證點數等於目標原始交易的相反數。
7. 建立新的 `student_point_transactions` adjustment/reversal 紀錄。
8. 更新 change request 狀態為 `approved`，寫入 `reviewed_by_user_id`、`reviewed_at` 與 `created_transaction_id`。

衝突處理：

- 異動申請已被其他管理員核准或拒絕：回傳 `point_change_request_status_conflict`。

## 管理員拒絕點數異動

Service：`PointChangeRequestService.reject`

Transaction 內步驟：

1. 鎖定 `student_point_change_requests`。
2. 驗證狀態仍為 `pending`。
3. 更新狀態為 `rejected`，寫入審核者、時間與原因。

## 主任異動

Service：`AdvisorAdminService.assignDirector`

Transaction 內步驟：

1. 鎖定目前啟用中的主任資料列。
2. 鎖定目標指導老師資料列。
3. 驗證目標老師為啟用狀態。
4. 將舊主任 `is_director` 設為 `false`。
5. 將新主任 `is_director` 設為 `true`。
6. 建立 `advisor.director_assigned` 通用稽核紀錄。

資料庫 `one_active_director` partial unique index 防止同時存在兩位啟用主任。

## 管理員移交

Service：`UserAdminService.transferAdmin` 或維運指令。

Transaction 內步驟：

1. 鎖定舊管理員與新管理員 `users` 資料列。
2. 驗證舊管理員目前啟用。
3. 驗證新管理員 `role = 'admin'`、`activated_at IS NOT NULL`、`is_active = FALSE`，且已完成密碼設定。
4. 停用舊管理員。
5. 啟用新管理員。
6. 撤銷舊管理員 session/token（實作依登入方案）。
7. 建立 `admin.transferred` 通用稽核紀錄。

## 點數規則版本切換

Service：`PointRuleAdminService.createRuleVersion`

Transaction 內步驟：

1. 鎖定同類規則目前有效或未來有效的候選資料列。
2. 驗證新規則有效期間與既有規則不重疊。
3. 若是替換目前規則，設定舊規則 `effective_to`。
4. 建立新規則。
5. 建立通用稽核紀錄。

Exclusion constraint 是最終防線。若兩個管理員同時建立重疊規則，其中一個 transaction 會因 constraint 失敗，Service 應轉換為 `point_rule_period_overlap`。

## 背景任務與人工操作衝突

逾期作廢背景任務與人工簽核、補件、審核可能同時發生。背景任務必須使用與人工操作相同的鎖定策略：

```sql
SELECT *
FROM point_applications
WHERE id = $1
FOR UPDATE;
```

取得鎖後重新驗證：

- 老師簽核逾期作廢：狀態仍為 `pending_advisor`，且 `advisor_confirmation_expires_at <= NOW()`。
- 補件逾期作廢：狀態仍為 `needs_revision`，且 `edit_token_expires_at <= NOW()`。

若狀態已改變，背景任務不得覆蓋人工操作結果。

## 冪等與重試

Idempotency key 是由前端或外部 client 對寫入 API 提供的唯一鍵，用來表示「這是同一次操作的重試」。完整通用機制通常需要額外資料表保存 key、request hash、response cache、到期時間，以及同 key 不同 payload 的衝突處理。

第一版不建立通用 `Idempotency-Key` 機制。原因：

- 系統主要是表單與審核流程，不是金流或第三方公開 API。
- 主要寫入流程已有狀態檢查、資料列鎖、unique constraint、token 清除與 `event_key` 防重複機制。
- 通用 idempotency 會增加資料表、response cache、清理策略與錯誤處理複雜度。

第一版依流程使用下列防重複機制：

- 申請狀態轉換在 Transaction 內使用 `point_applications FOR UPDATE` 並重新檢查狀態，避免已處理申請再次處理。
- Email task 使用 `event_key` unique constraint 防止重複建立同一通知。
- 帳號啟用、密碼重設與補件 token 使用成功後必須清除 token hash，避免同一 token 重複使用。
- 老師簽名以 `one_valid_signature_per_version` 防止同版本重複有效簽名。
- 承辦人核准以 `one_award_per_participant` 防止重複點數 award。
- 點數異動申請以 `one_pending_change_per_transaction` 防止同目標交易重複 pending 申請。

若未來出現大量網路重試、離線表單、第三方 API 或需要安全重放 response 的寫入流程，再新增通用 idempotency key 機制。
