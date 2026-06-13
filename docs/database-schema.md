# 資料庫 Schema

本文件保存已確認、可轉換為 Migration 的 PostgreSQL SQL。邏輯資料表說明請參考 [資料模型](data-model.md)，共用技術規範請參考 [Schema 設計規範](schema-conventions.md)。

## Schema 完成狀態

- [x] `users`
- [x] `advisors`
- [x] `point_applications`
- [x] `application_participants`
- [ ] 四種申請類型專屬資料表
- [ ] 四種點數規則資料表
- [ ] `application_attachments`
- [ ] `application_review_actions`
- [ ] `application_versions`
- [ ] `advisor_signatures`
- [ ] `student_point_change_requests`
- [ ] `student_point_transactions`
- [ ] `student_points_summary` View

## 共用資料庫物件

以下物件會在實作 Migration 時建立：

- `gen_random_uuid()` 所需擴充功能。
- `btree_gist`，用於防止點數規則有效期間重疊。
- 共用 `set_updated_at()` Trigger Function。

詳細定義請參考 [Schema 設計規範](schema-conventions.md)。

## `users`

```sql
CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  display_name VARCHAR(100) NOT NULL,
  email VARCHAR(320) NOT NULL,
  password_hash TEXT,
  role VARCHAR(20) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  activation_token_hash BYTEA,
  activation_token_expires_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  password_reset_token_hash BYTEA,
  password_reset_token_expires_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_role_check
    CHECK (role IN ('advisor', 'reviewer', 'admin')),

  CONSTRAINT users_email_normalized_check
    CHECK (email = LOWER(BTRIM(email))),

  CONSTRAINT users_activation_token_pair_check
    CHECK (
      (activation_token_hash IS NULL AND activation_token_expires_at IS NULL)
      OR
      (activation_token_hash IS NOT NULL AND activation_token_expires_at IS NOT NULL)
    ),

  CONSTRAINT users_password_reset_token_pair_check
    CHECK (
      (password_reset_token_hash IS NULL AND password_reset_token_expires_at IS NULL)
      OR
      (password_reset_token_hash IS NOT NULL AND password_reset_token_expires_at IS NOT NULL)
    )
);
```

欄位與資料規則：

- `password_hash` 使用 `TEXT`，保存包含演算法與參數資訊的密碼雜湊；首次設定密碼前可為 `NULL`。
- Token Hash 使用 `BYTEA`，保存 SHA-256 雜湊後的位元資料，不保存原始 Token。
- Token Hash 與對應的到期時間必須同時存在或同時為 `NULL`。
- `activated_at`、`last_login_at`、Token Hash 與 Token 到期時間允許為 `NULL`。
- Email 寫入前必須移除前後空白並轉為小寫。
- `users` 必須掛上共用 `set_updated_at()` Trigger。

索引：

```sql
CREATE UNIQUE INDEX users_email_unique
ON users (email);

CREATE UNIQUE INDEX users_activation_token_hash_unique
ON users (activation_token_hash)
WHERE activation_token_hash IS NOT NULL;

CREATE UNIQUE INDEX users_password_reset_token_hash_unique
ON users (password_reset_token_hash)
WHERE password_reset_token_hash IS NOT NULL;

CREATE UNIQUE INDEX one_active_admin
ON users (role)
WHERE role = 'admin' AND is_active = TRUE;
```

Token Hash Partial Unique Index 同時用於加速連結驗證查詢，並保證一個 Token 只能對應一個帳號。

## `advisors`

```sql
CREATE TABLE advisors (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL,
  employee_number VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  title VARCHAR(100) NOT NULL,
  department VARCHAR(100) NOT NULL,
  is_director BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT advisors_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);
```

欄位與資料規則：

- `user_id` 為 `NOT NULL` 且必須唯一，每位指導老師對應一個 `users` 帳號。
- `employee_number` 必須唯一，避免重複建立同一位教師資料。
- `is_active` 預設為 `TRUE`，與 `users.is_active` 預設 `FALSE` 不同；指導老師建立後通常立即可被選取，但實際是否出現在申請選單仍須搭配 `users.is_active` 與 `users.activated_at` 條件查詢。
- 對應的 `users.role` 必須為 `advisor`，由 Service 層在建立及修改時驗證，資料庫不額外建立跨表 `CHECK`。
- `advisors` 必須掛上共用 `set_updated_at()` Trigger。

索引：

```sql
CREATE UNIQUE INDEX advisors_user_id_unique
ON advisors (user_id);

CREATE UNIQUE INDEX advisors_employee_number_unique
ON advisors (employee_number);

CREATE UNIQUE INDEX one_active_director
ON advisors (is_director)
WHERE is_director = TRUE AND is_active = TRUE;
```

`one_active_director` Partial Unique Index 保證同一時間最多只能存在一位 `is_active = TRUE AND is_director = TRUE` 的主任。主任異動兩步操作必須在同一個 Transaction 中完成。

建立順序：

1. 建立 `users` 資料表（已完成）。
2. 建立 `advisors` 資料表。
3. 建立 `advisors_user_id_unique`、`advisors_employee_number_unique` 與 `one_active_director` 索引。
4. 為 `advisors` 掛上 `set_updated_at()` Trigger。

## `point_applications`

```sql
CREATE TABLE point_applications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid(),
  application_type VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL,
  advisor_id BIGINT NOT NULL,
  applicant_name VARCHAR(100) NOT NULL,
  applicant_email VARCHAR(320) NOT NULL,
  applicant_phone VARCHAR(30) NOT NULL,
  requested_total_points NUMERIC(10, 2) NOT NULL,
  approved_total_points NUMERIC(10, 2),
  current_version_id BIGINT,
  edit_token_hash BYTEA,
  edit_token_expires_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT point_applications_application_type_check
    CHECK (application_type IN (
      'competition',
      'certificate',
      'project_participation',
      'external_exhibition'
    )),

  CONSTRAINT point_applications_status_check
    CHECK (status IN (
      'pending_advisor',
      'under_review',
      'needs_revision',
      'approved',
      'rejected'
    )),

  CONSTRAINT point_applications_requested_total_points_check
    CHECK (requested_total_points >= 0),

  CONSTRAINT point_applications_approved_total_points_check
    CHECK (approved_total_points IS NULL OR approved_total_points >= 0),

  CONSTRAINT point_applications_applicant_email_normalized_check
    CHECK (applicant_email = LOWER(BTRIM(applicant_email))),

  CONSTRAINT point_applications_edit_token_pair_check
    CHECK (
      (edit_token_hash IS NULL AND edit_token_expires_at IS NULL)
      OR
      (edit_token_hash IS NOT NULL AND edit_token_expires_at IS NOT NULL)
    ),

  CONSTRAINT point_applications_advisor_fk
    FOREIGN KEY (advisor_id) REFERENCES advisors (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);
```

欄位與資料規則：

- `current_version_id` 在 `CREATE TABLE` 階段不建立外鍵，由後續 `ALTER TABLE` 加上指向 `application_versions` 的複合外鍵。詳見下一節〈申請與版本的循環外鍵〉。
- `applicant_email` 寫入前必須移除前後空白並轉為小寫，但不建立唯一索引。
- 補件 Token Hash 使用 `BYTEA`，與 `users` 的 Token 相同處理方式。
- `requested_total_points`、`approved_total_points` 與參與者點數的加總一致性由 Service 在 Transaction 中保證，資料庫層不建立跨表 `CHECK`。
- `point_applications` 必須掛上共用 `set_updated_at()` Trigger。

索引：

```sql
CREATE UNIQUE INDEX point_applications_public_id_unique
ON point_applications (public_id);

CREATE UNIQUE INDEX point_applications_edit_token_hash_unique
ON point_applications (edit_token_hash)
WHERE edit_token_hash IS NOT NULL;

CREATE INDEX idx_point_applications_status_submitted_at
ON point_applications (status, submitted_at);

CREATE INDEX idx_point_applications_advisor_status
ON point_applications (advisor_id, status);
```

`point_applications_edit_token_hash_unique` 同時用於加速補件連結驗證查詢，並保證一個 Token 只能對應一個申請。`idx_point_applications_status_submitted_at` 與 `idx_point_applications_advisor_status` 對應承辦人待審列表與指導老師待簽核列表的常用查詢。

## 申請與版本的循環外鍵

`point_applications.current_version_id` 保存 `application_versions.id`。為確保目前版本屬於同一筆申請，使用複合唯一限制與複合外鍵：

```sql
ALTER TABLE application_versions
ADD CONSTRAINT application_versions_id_application_unique
UNIQUE (id, application_id);

ALTER TABLE point_applications
ADD CONSTRAINT point_applications_current_version_fk
FOREIGN KEY (current_version_id, id)
REFERENCES application_versions (id, application_id)
ON DELETE RESTRICT
ON UPDATE RESTRICT;
```

首次建立申請時，`current_version_id` 暫時為 `NULL`。申請、第一版快照與目前版本更新必須在同一個 Transaction 中完成：

```sql
BEGIN;

INSERT INTO point_applications (..., current_version_id)
VALUES (..., NULL)
RETURNING id;

INSERT INTO application_versions (
  application_id,
  version_number,
  application_snapshot
)
VALUES ($applicationId, 1, $applicationSnapshot)
RETURNING id;

UPDATE point_applications
SET current_version_id = $applicationVersionId
WHERE id = $applicationId;

COMMIT;
```

若任一步驟失敗，Transaction 必須完整回滾，不可留下 `current_version_id IS NULL` 的不完整正式申請。

Migration 建立順序：

1. 先建立 `point_applications`，暫時不建立 `current_version_id` 外鍵。
2. 建立 `application_versions` 及其指向 `point_applications.id` 的外鍵。
3. 建立 `UNIQUE (id, application_id)`。
4. 最後使用 `ALTER TABLE point_applications` 建立 `current_version_id` 複合外鍵。

## `application_participants`

```sql
CREATE TABLE application_participants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL,
  class_name VARCHAR(100) NOT NULL,
  student_number VARCHAR(50) NOT NULL,
  student_name VARCHAR(100) NOT NULL,
  requested_points NUMERIC(10, 2) NOT NULL,
  approved_points NUMERIC(10, 2),
  is_applicant BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT application_participants_requested_points_check
    CHECK (requested_points > 0),

  CONSTRAINT application_participants_approved_points_check
    CHECK (approved_points IS NULL OR approved_points >= 0),

  CONSTRAINT application_participants_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT application_participants_application_student_unique
    UNIQUE (application_id, student_number)
);
```

欄位與資料規則：

- `requested_points` 必須大於 `0`；`approved_points` 在核准前為 `NULL`，核准時允許為 `0`。
- 申請人姓名（`is_applicant = TRUE` 的 `student_name`）與 `point_applications.applicant_name` 的一致性、參與者點數加總與申請總點數的一致性，皆由 Service 在 Transaction 內驗證，資料庫層不建立跨表 `CHECK` 或 Trigger。
- 補件採就地 `UPDATE`／`DELETE`／`INSERT`，歷史依賴 `application_versions.application_snapshot`。
- `application_participants` 必須掛上共用 `set_updated_at()` Trigger。

索引：

```sql
CREATE UNIQUE INDEX one_applicant_per_application
ON application_participants (application_id)
WHERE is_applicant = TRUE;
```

`UNIQUE (application_id, student_number)` 同時可作為以 `application_id` 為前綴的查詢索引使用，例如「列出某筆申請的所有參與者」。`one_applicant_per_application` Partial Unique Index 保證每筆申請最多只能有一位 `is_applicant = TRUE` 的參與者；「至少存在一位申請人」的條件由 Zod 與 Service 驗證保證。

建立順序：

1. 建立 `point_applications` 與循環外鍵的步驟完成後，才建立 `application_participants`。
2. 建立 `one_applicant_per_application` Partial Unique Index。
3. 為 `application_participants` 掛上 `set_updated_at()` Trigger。
