# 待決策項目

本文件只保存尚未完成正式設計的問題。決策完成後，應將結果移至對應正式文件，並從本文件移除或標記完成。

## 待討論項目

以下項目尚未完成正式設計。後續討論時應逐項確認決策，並將確定內容移至對應的正式設計章節。

### 1. 指導老師簽名檔案儲存

目前已確認：

- 簽名板固定輸出 PNG。
- 簽名檔案屬於敏感資料，不可使用公開靜態網址。
- 資料庫使用 `signature_storage_key` 保存檔案識別值。

仍需討論：

- 第一版使用伺服器本機私有目錄、S3、MinIO 或其他物件儲存。
- 簽名圖片的最大檔案大小、像素尺寸及是否需要壓縮。
- 簽名檔案的備份與災難復原方式。
- 簽名檔案保存期限及是否永久保存。
- 指導老師、承辦人與管理員查看簽名時的 API 與稽核規則。
- 簽名檔案遺失或損壞時的處理方式。

目前建議：

- 第一版可使用伺服器本機私有目錄，透過有權限驗證的 API 讀取。
- 儲存介面應封裝，讓未來可以替換成 S3 或 MinIO。
- 簽名應跟隨申請與審核紀錄長期保存，不由一般使用者刪除。

### 2. Email Queue 與通知排程

系統的帳號啟用、老師簽核、補件、逾期作廢與核准通知都依賴 Email，因此需要獨立設計可靠的寄信任務。

仍需討論：

- Email Queue 資料表欄位與任務狀態。
- 寄送失敗的最大重試次數、重試間隔與退避策略。
- 老師三次簽核提醒的實際寄送時間。
- 如何區分寄送失敗重試與尚未處理提醒。
- 如何避免相同通知被背景排程重複建立或寄送。
- 寄送永久失敗時，如何通知承辦人或管理員。
- 是否保存寄送對象、主旨、模板、成功時間與錯誤內容。
- Email 寄送服務與寄件者設定。

目前建議：

- Email Queue 任務使用唯一事件識別值，確保重複執行不會重複寄信。
- 寄送失敗使用有限次數重試；超過次數後標記永久失敗並通知系統管理者。
- Email 寄送失敗本身不應直接讓申請作廢。

### 3. 通知失敗與申請作廢政策

目前已確認老師逾期未簽核，以及申請人補件逾期時，申請會自動改為 `rejected` 並作廢。

仍需討論：

- 老師簽核 Email 一直寄送失敗時，申請是否繼續計算簽核期限。
- 補件 Email 無法寄達時，補件期限是否照常計算。
- Email 永久失敗時，是否建立承辦人待處理通知。
- 因 Email 無法寄達造成的作廢，是否允許特殊處理。
- 作廢申請是否在任何情況下都不可恢復。

目前建議：

- 系統應區分「使用者收到通知但未處理」與「系統無法成功寄送通知」。
- Email 永久失敗時，通知承辦人處理，不應直接將申請作廢。
- 已正常通知但逾期未處理的申請，作廢後不可恢復。

### 4. 通用系統稽核紀錄

`application_review_actions` 只記錄申請審核流程，帳號、教師、規則與管理操作仍需要通用稽核紀錄。

預計建立：

```text
audit_logs
- id
- actor_user_id
- action
- resource_type
- resource_id
- metadata
- ip_address
- user_agent
- created_at
```

仍需討論：

- 哪些操作必須建立稽核紀錄。
- `action` 與 `resource_type` 的固定值。
- 系統背景任務如何記錄操作人。
- 稽核紀錄的查詢權限。
- 稽核紀錄保存期限。
- 是否需要匯出稽核報表。

目前建議至少記錄：

- 帳號建立、啟用、停用、角色修改與管理員移交。
- 指導老師建立、停用與主任異動。
- 點數規則建立與失效。
- 管理員查看簽名、附件等敏感資料。
- 管理員核准或拒絕點數異動申請。
- 管理員帳號復原。

### 5. PostgreSQL Schema 詳細設計

邏輯資料模型、共用 Schema 規範與可執行 SQL 已拆分管理。目前 `users` 已完成可轉換為 Migration 的 PostgreSQL Schema，其餘資料表仍需逐張確認。

目前已確認：

- 所有資料表內部主鍵使用 `BIGINT GENERATED ALWAYS AS IDENTITY`。
- 內部外鍵關聯統一使用 `BIGINT`。
- 直接出現在 API URL、Email 連結或管理後台 URL 的資源，額外使用 UUID `public_id`。
- 目前 `point_applications`、`application_attachments` 與 `student_point_change_requests` 需要 `public_id`。
- UUID 不取代權限與資料所有權檢查。
- 時間點使用 `TIMESTAMPTZ`，純日期使用 `DATE`。
- 點數使用 `NUMERIC(10, 2)`，新台幣金額使用 `BIGINT` 整數元。
- Email、姓名、學號、電話及一般名稱欄位的共用長度規範已定義於 Schema 設計規範。
- 版本快照與結構化資料使用 `JSONB`，IP 位址使用 `INET`。
- 欄位預設使用 `NOT NULL`；確實可能不存在的資料才允許 `NULL`。
- 所有具有 `updated_at` 的資料表統一使用 PostgreSQL Trigger 自動更新時間。
- 所有外鍵統一使用 `ON DELETE RESTRICT ON UPDATE RESTRICT`。
- 第一版不使用 `ON DELETE CASCADE` 或 `ON DELETE SET NULL`。
- 正式資料不可實體刪除；使用停用、失效、狀態與點數沖銷保留歷史。
- 申請送出前不寫入草稿或暫存附件，附件與申請資料在同一次送出流程中建立。
- 請求先由 Zod 驗證格式與可從單次 Request 判斷的規則，再進入 Service 與資料庫 Transaction。
- Service 負責需要查詢資料庫、跨資料列及流程狀態的業務規則。
- PostgreSQL 使用 `CHECK`、`UNIQUE`、Partial Unique Index 與 Transaction 作為最終資料完整性保護。
- 第一版核心 Constraint 與 Index 清單已定義於 Schema 設計規範。
- 點數規則有效期間使用半開區間 `[effective_from, effective_to)`，`effective_to` 當天開始失效。
- 各點數規則表使用 Exclusion Constraint 防止同一種規則的有效日期重疊。
- 管理員切換規則時，必須在同一個 Transaction 中結束舊規則並建立新規則。
- `point_applications.current_version_id` 保存 `application_versions.id`，不是 `version_number`。
- 使用複合外鍵確保 `current_version_id` 指向同一筆申請所擁有的版本。
- 建立申請時 `current_version_id` 暫時允許為 `NULL`，申請、第一版快照與目前版本更新必須在同一個 Transaction 中完成。
- 循環外鍵由 Migration 先建立兩張資料表，再使用 `ALTER TABLE` 建立 `current_version_id` 複合外鍵。
- `users` 的實際 PostgreSQL 欄位型別、`NULL` 規則、Constraint 與 Index 已確定。
- 帳號新增 `activated_at`，用來區分尚未完成首次啟用與後續被管理員停用。
- 帳號啟用與密碼重設 Token Hash 使用 `BYTEA`，並建立非 `NULL` 值的 Partial Unique Index。

仍需討論：

- 除 `users`、`advisors`、`point_applications`、`application_participants`、四張點數規則資料表與四張類型專屬資料表外，其餘資料表套用共用型別規範後，各欄位的最終型別與 `NULL` 限制。

### 6. Migration 與初始資料 Seed

仍需討論：

- 使用哪個 Migration 工具，例如 `node-pg-migrate`。
- Migration 檔案命名及執行規則。
- 初始管理員建立方式。
- 初始競賽、參與計畫、證照及校外展覽點數規則 Seed。
- 開發、測試與正式環境的 Seed 差異。
- Migration 失敗與回滾策略。

### 7. API Endpoint 與 Service 邊界

仍需討論：

- 公開申請 API。
- 補件 Token 驗證與重新提交 API。
- 指導老師登入後的待簽核、簽名與拒絕 API。
- 承辦人待審列表、補件、調整、核准與拒絕 API。
- 管理員帳號、教師、主任、點數規則與異動申請管理 API。
- 公開學生點數總表查詢 API。
- 私有附件與簽名檔案存取 API。
- Controller、Service、Repository 的責任邊界。
- API Response、錯誤代碼、分頁與排序格式。

目前建議：

- Controller 只處理 HTTP 輸入輸出。
- Service 執行業務規則與 Transaction。
- Repository 集中管理 SQL 查詢。

### 8. Transaction 與併發控制

目前已確認部分重要操作需要 PostgreSQL Transaction 與 `SELECT ... FOR UPDATE`。

仍需完整列出 Transaction 邊界：

- 建立申請、參與者、專屬資料、附件與第一版快照。
- 補件重新提交、建立新版本、更新目前版本與使舊簽名失效。
- 承辦人核准申請與建立所有學生點數流水帳。
- 管理員核准點數異動申請與建立調整流水帳。
- 管理員移交。
- 主任異動。
- 規則版本切換。

仍需討論：

- 各流程需要鎖定哪些資料列。
- 證照累積上限的併發保護方式。
- 背景任務與人工操作同時執行時的衝突處理。
- API 重試時如何確保操作冪等。

### 9. 登入、Session 與安全

仍需討論：

- Access Token 與 Refresh Token，或伺服器 Session 的選擇。
- Token 有效期限與撤銷方式。
- 帳號停用、密碼修改及角色變更後，現有 Session 是否立即失效。
- 登入失敗次數限制及暫時鎖定。
- 密碼強度規則。
- Cookie 的 `HttpOnly`、`Secure` 與 `SameSite` 設定。
- CSRF、CORS 與 Rate Limit。
- 公開申請、補件與學生點數查詢 API 的濫用防護。
- 敏感欄位在 Log 與錯誤訊息中的遮罩。

### 10. 測試策略

仍需討論：

- 單元測試、整合測試與端對端測試的範圍。
- PostgreSQL 測試資料庫與 Transaction Rollback 策略。
- 各申請類型點數規則測試。
- 補件、多版本與重新簽名流程測試。
- 角色權限與資料所有權測試。
- 多位承辦人同時操作的併發測試。
- Email Queue、逾期提醒與自動作廢測試。
- 核准後點數異動與沖銷測試。

### 11. 舊 MongoDB 資料遷移

仍需確認舊系統資料是否需要保留並遷移至 PostgreSQL。

若需要遷移，必須討論：

- 舊申請、帳號、附件、點數與寄信任務需要遷移的範圍。
- 舊狀態與新狀態的對應。
- 舊表單缺少版本、簽名與規則關聯時的處理方式。
- 資料清理、驗證與遷移報告。
- 遷移期間的停機或唯讀策略。

若此專案主要用於重新開發與面試展示，可以不遷移舊資料，改用 Seed 建立展示資料。

### 建議討論順序

1. Email Queue 與通知排程。
2. 通知失敗與申請作廢政策。
3. 指導老師簽名檔案儲存。
4. 通用系統稽核紀錄。
5. PostgreSQL Schema 詳細設計。
6. Migration 與初始資料 Seed。
7. API Endpoint 與 Service 邊界。
8. Transaction 與併發控制。
9. 登入、Session 與安全。
10. 測試策略。
11. 舊 MongoDB 資料是否遷移。
