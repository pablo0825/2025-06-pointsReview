# Migration 與 Seed 方案

本文件描述如何將 [資料庫 Schema](database-schema.md) 中已確認的 PostgreSQL SQL 轉換為可版本控管、可重複執行、可部署的 Migration 與初始資料 Seed。

## 目標

- 讓資料庫結構變更可被 Git 追蹤與 Code Review。
- 開發、測試與正式環境使用同一套 Migration 建立 schema。
- Migration 只負責資料庫結構與必要資料修正，不混入業務流程。
- Seed 與 Migration 分開管理，避免正式環境誤寫入展示或測試資料。
- 所有 Migration 必須可重複套用於乾淨資料庫，並能清楚知道目前資料庫版本。

## 工具選擇

第一版建議採用 `node-pg-migrate`。

原因：

- 專注於 PostgreSQL，符合本專案直接使用 `pg` 的方向。
- 支援 JavaScript/TypeScript migration，也能直接執行 raw SQL。
- 會維護 migration 執行紀錄表，避免同一個 migration 重複執行。
- 不要求導入 ORM，和目前「Repository 集中管理 SQL」的設計相容。

第一版 migration 建議以 **raw SQL 為主**，因為 [資料庫 Schema](database-schema.md) 已經整理出完整 SQL，且包含 PostgreSQL 專屬功能，例如 partial unique index、exclusion constraint、trigger function 與 view。

## 目錄建議

```text
migrations/
  001_init_extensions_and_functions.sql
  002_create_users.sql
  003_create_user_sessions.sql
  004_create_audit_logs.sql
  005_create_advisors.sql
  006_create_point_applications.sql
  007_create_email_tasks.sql
  008_create_application_versions.sql
  009_add_application_current_version_fk.sql
  010_create_application_participants.sql
  011_create_point_rule_tables.sql
  012_create_application_type_detail_tables.sql
  013_create_application_attachments.sql
  014_create_application_review_actions.sql
  015_create_advisor_signatures.sql
  016_create_student_point_transactions.sql
  017_create_student_point_change_requests.sql
  018_create_student_points_summary_view.sql

seeds/
  development/
    001_seed_admin.sql
    002_seed_point_rules.sql
    003_seed_demo_advisors.sql
  test/
    001_seed_test_accounts.sql
    002_seed_point_rules.sql
  production/
    README.md
```

實際檔名可在實作時加上 timestamp，例如 `202607040001_create_users.sql`。若使用 timestamp，仍建議保留可讀名稱，避免只靠時間辨識內容。

## Migration 建立順序

Migration 必須遵守資料表外鍵與共用物件依賴順序。

1. 啟用 PostgreSQL extension：
   - `gen_random_uuid()` 所需 extension。
   - `btree_gist`，供點數規則 exclusion constraint 使用。
2. 建立共用 `set_updated_at()` trigger function。
3. 建立 `users`。
4. 建立 `user_sessions`。
5. 建立 `audit_logs`。
6. 建立 `advisors`。
7. 建立 `point_applications`，此階段先不建立 `current_version_id` 外鍵。
8. 建立 `email_tasks`。
9. 建立 `application_versions`。
10. 透過 `ALTER TABLE` 建立：
   - `application_versions_id_application_unique`
   - `point_applications_current_version_fk`
11. 建立 `application_participants`。
12. 建立四張點數規則表。
13. 建立四張申請類型專屬資料表。
14. 建立 `application_attachments`。
15. 建立 `application_review_actions`。
16. 建立 `advisor_signatures`。
17. 建立 `student_point_transactions`。
18. 建立 `student_point_change_requests`。
19. 建立 `student_points_summary` View。
20. 為所有具有 `updated_at` 的資料表掛上 `set_updated_at()` trigger。

循環外鍵不得在 `point_applications` 的 `CREATE TABLE` 階段建立，必須等 `application_versions` 建立後再用 `ALTER TABLE` 補上。

## Migration 寫法規則

- 每個 migration 檔案只處理一個清楚主題，例如一張資料表、一組高度相關的 constraint 或一個 view。
- Migration 檔案一旦進入 shared branch 或正式環境，不可修改既有檔案內容；後續調整必須新增 migration。
- `CREATE TABLE` 應包含欄位、`CHECK`、外鍵與表內唯一限制。
- Index 可放在同一 migration 的表格建立後方；若 index 對查詢很重且可能耗時，未來正式環境可拆成獨立 migration。
- View 建議獨立 migration，便於日後使用 `CREATE OR REPLACE VIEW` 調整。
- 不在 migration 中寫入展示資料、測試帳號或測試申請。

## Rollback 策略

第一版以「開發環境可重建、正式環境向前修正」為原則。

- 開發與測試環境可使用 drop database / recreate database 重新套用 migration。
- 正式環境不依賴自動 down migration 回滾資料結構。
- 已部署到正式環境的錯誤 schema，應新增 forward migration 修正。
- 會造成資料遺失的變更，例如 drop column、改欄位型別或刪除 constraint，必須先寫資料影響評估。
- 若 migration 執行失敗，部署流程必須停止，不可繼續啟動新版應用程式。

若使用 `node-pg-migrate`，仍可為開發便利提供 down migration；但正式環境不得把 down migration 當作主要復原策略。

## Seed 分層

Seed 分為必要 seed 與環境 seed。

必要 seed：

- 第一個管理員帳號建立方式。
- 初始競賽、參與計畫、證照與校外展覽點數規則。

環境 seed：

- Development：可建立展示用指導老師、承辦人、申請與點數資料。
- Test：只建立測試案例需要的最小資料。
- Production：不自動建立展示資料；初始管理員應由維運指令或一次性受控流程建立。

固定代碼如 `advisors.title_code`、`grade`、`class_number` 不需要 seed 資料，第一版由後端與前端共用常數或 enum 對照表維護。若未來職稱或班級需要後台維護，再評估拆表與資料 seed。

## 初始管理員

第一版不建議在 migration 中直接寫入正式管理員帳號，避免把真實 Email、Token 或密碼流程混入 schema 版本。

建議使用維運指令建立初始管理員：

```text
npm run admin:create -- admin@example.com
```

此指令應：

- 驗證目前不存在啟用中的管理員，或要求明確的維運確認。
- 建立 `users.role = 'admin'` 的帳號。
- 產生帳號啟用 token，資料庫只保存 token hash。
- 寄送啟用連結，或在開發環境輸出一次性啟用連結。
- 建立 `maintenance.admin_created` 通用稽核紀錄。

## 初始點數規則 Seed

初始點數規則應使用獨立 seed 檔，不放入 schema migration。

原因：

- 點數規則屬於業務設定，不是資料庫結構。
- 未來規則可能因年度或政策調整而新增版本。
- Seed 可以依環境調整，例如測試環境建立較少規則，開發環境建立完整展示資料。

Seed 必須遵守點數規則表的 exclusion constraint：同一規則維度不可有重疊有效期間。

## 驗證

每次新增或調整 migration 時，至少應驗證：

- 乾淨資料庫可從第一個 migration 跑到最新版本。
- `student_points_summary` View 可成功建立。
- 所有 trigger function 與 table trigger 存在。
- Seed 可在 migration 完成後執行。
- 重複執行 migration runner 不會再次執行已完成 migration。

PostgreSQL 測試資料庫與 migration 驗證流程請參考 [測試策略](testing-strategy.md#migration-驗證)。
