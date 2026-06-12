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

## 相關文件

- 產品行為與狀態流程：[產品流程](product-workflows.md)
- 資料表與欄位：[資料模型](data-model.md)
- PostgreSQL 共用規範與 Transaction 限制：[Schema 設計規範](schema-conventions.md)
- 可轉換為 Migration 的完整 SQL：[資料庫 Schema](database-schema.md)
- 登入與角色授權：[帳號與權限](authorization.md)
- 尚待設計的 Email Queue、儲存、稽核、安全與測試：[待決策項目](open-decisions.md)
