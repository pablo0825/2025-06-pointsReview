# 基礎設施設計

本文件集中記錄跨模組的技術責任邊界。實作時仍需確認的選型、設定與部署細節集中在 [實作時確認項目](open-decisions.md)。

## 已確認方向

- 資料庫使用 PostgreSQL，應用程式透過 `pg` 存取。
- 第一版正式環境使用 Redis 作為 rate limit store；local development 與單元測試可使用 in-memory store。
- 第一版可使用 frontend、backend 分離容器，前方由 reverse proxy 對外提供同一個 HTTPS origin，例如 `/` 轉發 frontend、`/api` 轉發 backend。
- 第一版可使用 Docker Compose 管理 frontend、backend、PostgreSQL、Redis 與 reverse proxy；PostgreSQL、Redis 與私有檔案目錄必須使用 persistent volume 或受控資料目錄，container 本身不得視為資料保存位置。
- Controller 只處理 HTTP 輸入輸出；Service 執行業務規則與 Transaction；Repository 集中管理 SQL。
- 寄信失敗重試與尚未處理提醒是不同流程。
- 敏感附件與簽名第一版使用伺服器本機私有目錄，透過權限驗證 API 存取。
- 第一版備份復原目標為 RPO `24` 小時、RTO `24` 小時；PostgreSQL 與私有檔案目錄必須每日加密備份，且備份不得只保存在正式主機本機。
- Redis 只保存 rate limit、登入失敗計數等短期狀態；第一版不作為長期資料備份來源。
- 最終審核寫入使用短時間 PostgreSQL Transaction 與 `SELECT ... FOR UPDATE` 防止重複處理。
- 通用系統稽核紀錄使用 `audit_logs`，與主要業務操作在同一個 Transaction 中寫入。
- 點數規則採不可覆蓋的版本化設計，以首次送件時間決定適用規則。
- 申請、簽名、審核與學生點數異動皆保留歷史紀錄。
- 第一版不遷移舊 MongoDB 資料，新系統從乾淨 PostgreSQL schema 與 seed 開始。

## Email Worker

Email worker 負責處理 `email_tasks` 中的寄信任務。Worker 定期查詢 `status = 'pending'` 且 `scheduled_at <= NOW()` 的任務，寄送前先將任務標記為 `processing`。

寄送成功時，worker 將任務更新為 `sent` 並寫入 `sent_at`。寄送失敗時，worker 增加 `attempt_count`、寫入 `last_error`，並依 `attempt_count` 與 `max_attempts` 決定將任務重新排程為 `pending`，或標記為 `failed`。重試間隔、退避策略與不可重試錯誤類型由 worker 設定控制。

寄信任務只處理通知投遞，不決定申請是否逾期或是否作廢。老師簽核期限與補件期限仍由申請流程排程依 `point_applications` 的狀態與期限欄位判斷。

完整狀態機、template、`event_key`、worker claim SQL、重試策略與通知失敗政策請參考 [Email Queue 與通知排程](email-queue.md)。

## 相關文件

- 產品行為與狀態流程：[產品流程](product-workflows.md)
- 資料表與欄位：[資料模型](data-model.md)
- PostgreSQL 共用規範與 Transaction 限制：[Schema 設計規範](schema-conventions.md)
- 可轉換為 Migration 的完整 SQL：[資料庫 Schema](database-schema.md)
- Migration 工具、執行順序與 Seed 分層：[Migration 與 Seed 方案](migration-plan.md)
- 登入與角色授權：[帳號與權限](authorization.md)
- API 分組、Service 與 Repository 邊界：[API 與 Service 邊界](api-service-boundaries.md)
- API request、response、分頁與錯誤碼：[API Request / Response Schema](api-schemas.md)
- 重要寫入流程 Transaction 與併發控制：[Transaction 與併發控制](transaction-concurrency.md)
- Email 任務、提醒排程與失敗政策：[Email Queue 與通知排程](email-queue.md)
- 登入、Session、CSRF、CORS 與 Rate Limit：[登入、Session 與安全設計](auth-session-security.md)
- 帳號、教師、規則與敏感檔案查看稽核：[通用系統稽核紀錄](audit-logs.md)
- 附件與簽名檔案儲存：[私有檔案儲存設計](file-storage.md)
- 測試分層、資料庫測試與 CI 門檻：[測試策略](testing-strategy.md)
- 舊 MongoDB 資料不遷移決策：[舊資料處理決策](legacy-data-decision.md)
