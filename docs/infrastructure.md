# 基礎設施設計

本文件集中記錄跨模組的技術責任邊界。尚未完成的基礎設施設計問題集中在 [待決策項目](open-decisions.md)。

## 已確認方向

- 資料庫使用 PostgreSQL，應用程式透過 `pg` 存取。
- Controller 只處理 HTTP 輸入輸出；Service 執行業務規則與 Transaction；Repository 集中管理 SQL。
- 寄信失敗重試與尚未處理提醒是不同流程。
- 敏感附件與簽名使用私有儲存，透過權限驗證 API 存取。
- 最終審核寫入使用短時間 PostgreSQL Transaction 與 `SELECT ... FOR UPDATE` 防止重複處理。
- 點數規則採不可覆蓋的版本化設計，以首次送件時間決定適用規則。
- 申請、簽名、審核與學生點數異動皆保留歷史紀錄。

## Email Worker

Email worker 負責處理 `email_tasks` 中的寄信任務。Worker 定期查詢 `status = 'pending'` 且 `scheduled_at <= NOW()` 的任務，寄送前先將任務標記為 `processing`。

寄送成功時，worker 將任務更新為 `sent` 並寫入 `sent_at`。寄送失敗時，worker 增加 `attempt_count`、寫入 `last_error`，並依 `attempt_count` 與 `max_attempts` 決定將任務重新排程為 `pending`，或標記為 `failed`。重試間隔、退避策略與不可重試錯誤類型由 worker 設定控制。

寄信任務只處理通知投遞，不決定申請是否逾期或是否作廢。老師簽核期限與補件期限仍由申請流程排程依 `point_applications` 的狀態與期限欄位判斷。

## 相關文件

- 產品行為與狀態流程：[產品流程](product-workflows.md)
- 資料表與欄位：[資料模型](data-model.md)
- PostgreSQL 共用規範與 Transaction 限制：[Schema 設計規範](schema-conventions.md)
- 可轉換為 Migration 的完整 SQL：[資料庫 Schema](database-schema.md)
- 登入與角色授權：[帳號與權限](authorization.md)
- 尚待設計的 Email Queue、儲存、稽核、安全與測試：[待決策項目](open-decisions.md)
