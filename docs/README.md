# 點數審核系統設計文件

本目錄整理點數審核系統翻新後的產品流程、PostgreSQL 資料模型、角色權限、基礎設施設計與實作時確認項目。

系統將從 MongoDB / Mongoose 遷移至 PostgreSQL / `pg`，並支援競賽、參與計畫、證照及校外展覽等多種點數申請類型。

## 文件索引

### 產品與業務規則

- [產品流程](product-workflows.md)：申請、簽核、補件、審核、逾期與點數異動流程。
- [點數系統](point-system.md)：點數規則的業務語意、實際點數對應表、計算公式、版本管理政策、流水帳查詢方式與公開遮罩規則。
- [舊資料處理決策](legacy-data-decision.md)：第一版不遷移舊 MongoDB 資料，新系統從乾淨 PostgreSQL 開始。

### 資料庫與資料一致性

- [資料模型](data-model.md)：ER 圖、所有資料表與 View 的欄位定義、允許值、Constraint 與關聯。
- [Schema 設計規範](schema-conventions.md)：PostgreSQL 共用型別、外鍵、驗證、Constraint 與 Index 規範。
- [資料庫 Schema](database-schema.md)：已確認的完整 `CREATE TABLE`、Trigger、Index 與其他可轉換為 Migration 的 SQL。
- [Transaction 與併發控制](transaction-concurrency.md)：重要寫入流程的 Transaction 邊界、資料列鎖定、併發衝突與冪等策略。
- [Migration 與 Seed 方案](migration-plan.md)：Migration 工具、檔案順序、rollback 原則、seed 分層與初始管理員建立方式。

### API 與後端分層

- [API 與 Service 邊界](api-service-boundaries.md)：API 分組、權限、Service 職責、Repository 分組與 Transaction 需求摘要。
- [API Request / Response Schema](api-schemas.md)：共用 response、分頁、錯誤碼、主要 endpoint request / response 與私有檔案 header。
- [Zod 驗證規格](zod-validation.md)：API request 進入 Service 前的 Zod 驗證責任、schema 分層、跨欄位規則與 Service 驗證邊界。

### 帳號、權限與安全

- [帳號與權限](authorization.md)：帳號生命週期、角色、權限代碼與權限矩陣。
- [登入、Session 與安全設計](auth-session-security.md)：登入方案、Session、Cookie、CSRF、CORS、Rate Limit 與敏感資料遮罩。
- [通用系統稽核紀錄](audit-logs.md)：帳號、教師、規則、敏感檔案、維運與背景任務的 audit log 設計。

### 背景任務、檔案與基礎設施

- [Email Queue 與通知排程](email-queue.md)：Email 任務狀態、模板、event key、worker claim/retry、提醒排程與失敗政策。
- [私有檔案儲存設計](file-storage.md)：附件與簽名檔案的本機私有儲存、storage key、驗證、讀取、備份與替換策略。
- [基礎設施](infrastructure.md)：已確認的技術責任邊界與後續基礎設施設計方向。

### 品質與實作追蹤

- [第一版實作計劃](implementation-plan.md)：從現有 Express 專案改造至 PostgreSQL 的階段式實作 checklist。
- [測試策略](testing-strategy.md)：測試分層、PostgreSQL 測試資料庫、migration 驗證、流程矩陣、併發測試與 CI 門檻。
- [實作時確認項目](open-decisions.md)：第一版設計收斂後，實作時仍需確認的選型、設定與部署細節。

## 建議閱讀順序

1. 先讀 [產品流程](product-workflows.md) 與 [點數系統](point-system.md)，確認業務行為。
2. 再讀 [資料模型](data-model.md)、[Schema 設計規範](schema-conventions.md) 與 [資料庫 Schema](database-schema.md)，確認資料結構。
3. 實作 API 前讀 [API 與 Service 邊界](api-service-boundaries.md)、[API Request / Response Schema](api-schemas.md) 與 [Zod 驗證規格](zod-validation.md)。
4. 實作登入、後台或敏感檔案前讀 [帳號與權限](authorization.md)、[登入、Session 與安全設計](auth-session-security.md)、[通用系統稽核紀錄](audit-logs.md) 與 [私有檔案儲存設計](file-storage.md)。
5. 實作寫入流程與背景任務前讀 [Transaction 與併發控制](transaction-concurrency.md)、[Email Queue 與通知排程](email-queue.md) 與 [測試策略](testing-strategy.md)。

## 核心設計原則

- 申請人不需要登入，但必須是申請參與者之一。
- 指導老師從系統名單選擇，登入後才能簽名。
- 承辦人負責一般申請審核，管理員負責系統管理及核准後點數異動審核。
- 申請版本、簽名、審核操作及學生點數皆保留不可覆蓋的歷史紀錄。
- 點數規則採有效日期版本化，已提交申請沿用首次送件時適用的規則。
- 敏感附件與簽名使用私有儲存，公開學生點數總表必須遮罩姓名與學號。
