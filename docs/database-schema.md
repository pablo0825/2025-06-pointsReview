# 資料庫 Schema

本文件保存已確認、可轉換為 Migration 的 PostgreSQL SQL。邏輯資料表說明請參考 [資料模型](data-model.md)，共用技術規範請參考 [Schema 設計規範](schema-conventions.md)。

## Schema 完成狀態

- [x] `users`
- [x] `advisors`
- [x] `point_applications`
- [x] `application_participants`
- [x] 四種申請類型專屬資料表
- [x] 四種點數規則資料表
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

## 點數規則資料表

四張規則表共用「半開區間 + Exclusion Constraint 防重疊」的版本管理模式，所有規則皆**不包含 `is_active` 欄位**，停用透過設定 `effective_to` 達成。規則表的業務語意與計算公式請參考 [點數系統](point-system.md)。

建立規則表前必須啟用 `btree_gist` 擴充功能：

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

### `competition_point_rules`

```sql
CREATE TABLE competition_point_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_level VARCHAR(40) NOT NULL,
  award VARCHAR(30) NOT NULL,
  allocation_method VARCHAR(20) NOT NULL,
  points NUMERIC(10, 2) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT competition_point_rules_competition_level_check
    CHECK (competition_level IN (
      'international_integrated',
      'international_non_integrated',
      'national_integrated',
      'national_non_integrated',
      'other'
    )),

  CONSTRAINT competition_point_rules_award_check
    CHECK (award IN (
      'first_place',
      'second_place',
      'third_place',
      'honorable_mention',
      'other_award',
      'finalist',
      'participation'
    )),

  CONSTRAINT competition_point_rules_allocation_method_check
    CHECK (allocation_method IN ('per_person', 'shared_total')),

  CONSTRAINT competition_point_rules_points_check
    CHECK (points >= 0),

  CONSTRAINT competition_point_rules_effective_range_check
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

ALTER TABLE competition_point_rules
ADD CONSTRAINT competition_point_rules_no_overlap
EXCLUDE USING gist (
  competition_level WITH =,
  award WITH =,
  daterange(effective_from, effective_to, '[)') WITH &&
);
```

### `project_point_rules`

```sql
CREATE TABLE project_point_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  salary_unit BIGINT NOT NULL,
  points_per_unit NUMERIC(10, 2) NOT NULL,
  rounding_method VARCHAR(20) NOT NULL,
  maximum_points NUMERIC(10, 2),
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT project_point_rules_salary_unit_check
    CHECK (salary_unit > 0),

  CONSTRAINT project_point_rules_points_per_unit_check
    CHECK (points_per_unit > 0),

  CONSTRAINT project_point_rules_rounding_method_check
    CHECK (rounding_method IN ('floor')),

  CONSTRAINT project_point_rules_maximum_points_check
    CHECK (maximum_points IS NULL OR maximum_points >= 0),

  CONSTRAINT project_point_rules_effective_range_check
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

ALTER TABLE project_point_rules
ADD CONSTRAINT project_point_rules_no_overlap
EXCLUDE USING gist (
  daterange(effective_from, effective_to, '[)') WITH &&
);
```

`rounding_method` 目前 CHECK 只允許 `'floor'`，但保留欄位以便未來擴充其他取整策略（例如 `'round'`、`'ceiling'`）。新增允許值時只需 `ALTER TABLE` 修改 CHECK。

### `certificate_point_rules`

```sql
CREATE TABLE certificate_point_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  points_per_certificate NUMERIC(10, 2) NOT NULL,
  maximum_points_per_student NUMERIC(10, 2) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT certificate_point_rules_points_per_certificate_check
    CHECK (points_per_certificate > 0),

  CONSTRAINT certificate_point_rules_maximum_points_per_student_check
    CHECK (maximum_points_per_student > 0),

  CONSTRAINT certificate_point_rules_effective_range_check
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

ALTER TABLE certificate_point_rules
ADD CONSTRAINT certificate_point_rules_no_overlap
EXCLUDE USING gist (
  daterange(effective_from, effective_to, '[)') WITH &&
);
```

未強制 `maximum_points_per_student >= points_per_certificate` 的跨欄位 CHECK，保留學校未來調整證照類點數政策（包含完全取消）的彈性。

### `exhibition_point_rules`

```sql
CREATE TABLE exhibition_point_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exhibition_type VARCHAR(40) NOT NULL,
  minimum_points_per_person NUMERIC(10, 2) NOT NULL,
  maximum_points_per_person NUMERIC(10, 2) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT exhibition_point_rules_exhibition_type_check
    CHECK (exhibition_type IN (
      'creative_work',
      'graduation_project_exhibition'
    )),

  CONSTRAINT exhibition_point_rules_minimum_points_check
    CHECK (minimum_points_per_person >= 0),

  CONSTRAINT exhibition_point_rules_maximum_points_check
    CHECK (maximum_points_per_person >= minimum_points_per_person),

  CONSTRAINT exhibition_point_rules_effective_range_check
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

ALTER TABLE exhibition_point_rules
ADD CONSTRAINT exhibition_point_rules_no_overlap
EXCLUDE USING gist (
  exhibition_type WITH =,
  daterange(effective_from, effective_to, '[)') WITH &&
);
```

### 共用設計說明

- 四張表都使用 `[effective_from, effective_to)` 半開區間；`effective_to` 為 `NULL` 代表無限期有效。
- Exclusion Constraint 同時提供查詢索引，因此查詢「申請日期適用的規則」不需另外建立 index。
- 四張表皆必須掛上共用 `set_updated_at()` Trigger。
- 已被申請使用的規則不可修改、不可刪除；停用透過 `UPDATE ... SET effective_to = ?`。
- 規則切換（設舊規則 `effective_to` + 建立新規則）必須在同一 Transaction 中完成，否則 Exclusion Constraint 會拒絕重疊寫入。

建立順序：

1. 啟用 `btree_gist` 擴充功能。
2. 建立四張規則資料表（含內嵌 CHECK）。
3. 為每張表建立 Exclusion Constraint。
4. 為四張規則表各自掛上 `set_updated_at()` Trigger。

## 申請類型專屬資料表

四張類型專屬表共用以下模式：

- `application_id` 為 `NOT NULL`，並透過 `UNIQUE` 確保與 `point_applications` 為一對一關係。
- `*_point_rule_id` 為 `NOT NULL` 外鍵，指向對應的規則表，記錄送件時適用的歷史規則。
- 所有 `*_other` 欄位皆使用條件式 `CHECK` 保證與其對應選項一致。
- 補件採就地 `UPDATE`，歷史依賴 `application_versions.application_snapshot`。
- 四張表皆需掛上共用 `set_updated_at()` Trigger。

四張表必須在 `point_applications` 與對應規則表建立完成後才能建立。

### `competition_application_details`

```sql
CREATE TABLE competition_application_details (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL,
  competition_level_requested VARCHAR(40) NOT NULL,
  competition_level_other VARCHAR(100),
  competition_level_approved VARCHAR(40),
  competition_level_approved_other VARCHAR(100),
  competition_point_rule_id BIGINT NOT NULL,
  competition_name VARCHAR(255) NOT NULL,
  competition_category VARCHAR(100) NOT NULL,
  award VARCHAR(30) NOT NULL,
  award_other VARCHAR(100),
  competition_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT competition_application_details_level_requested_check
    CHECK (competition_level_requested IN (
      'international_integrated',
      'international_non_integrated',
      'national_integrated',
      'national_non_integrated',
      'other'
    )),

  CONSTRAINT competition_application_details_level_approved_check
    CHECK (
      competition_level_approved IS NULL
      OR competition_level_approved IN (
        'international_integrated',
        'international_non_integrated',
        'national_integrated',
        'national_non_integrated',
        'other'
      )
    ),

  CONSTRAINT competition_application_details_level_other_pair_check
    CHECK (
      (competition_level_requested = 'other' AND competition_level_other IS NOT NULL)
      OR
      (competition_level_requested <> 'other' AND competition_level_other IS NULL)
    ),

  CONSTRAINT competition_application_details_level_approved_other_pair_check
    CHECK (
      (competition_level_approved IS NULL AND competition_level_approved_other IS NULL)
      OR
      (competition_level_approved = 'other' AND competition_level_approved_other IS NOT NULL)
      OR
      (competition_level_approved IS NOT NULL
       AND competition_level_approved <> 'other'
       AND competition_level_approved_other IS NULL)
    ),

  CONSTRAINT competition_application_details_award_check
    CHECK (award IN (
      'first_place',
      'second_place',
      'third_place',
      'honorable_mention',
      'other_award',
      'finalist',
      'participation'
    )),

  CONSTRAINT competition_application_details_award_other_pair_check
    CHECK (
      (award = 'other_award' AND award_other IS NOT NULL)
      OR
      (award <> 'other_award' AND award_other IS NULL)
    ),

  CONSTRAINT competition_application_details_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT competition_application_details_rule_fk
    FOREIGN KEY (competition_point_rule_id) REFERENCES competition_point_rules (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT competition_application_details_application_unique
    UNIQUE (application_id)
);
```

`award` 使用 `'other_award'`（而非 `'other'`）作為「其他獎項」識別值，避免與 `competition_level_requested = 'other'` 在 SQL 查詢時產生視覺混淆。

### `project_participation_details`

```sql
CREATE TABLE project_participation_details (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL,
  project_point_rule_id BIGINT NOT NULL,
  project_name VARCHAR(255) NOT NULL,
  principal_investigator VARCHAR(100) NOT NULL,
  salary_start_month DATE NOT NULL,
  salary_end_month DATE NOT NULL,
  monthly_salary BIGINT NOT NULL,
  work_description TEXT NOT NULL,
  total_salary BIGINT NOT NULL,
  calculated_points NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT project_participation_details_salary_start_month_first_day_check
    CHECK (EXTRACT(DAY FROM salary_start_month) = 1),

  CONSTRAINT project_participation_details_salary_end_month_first_day_check
    CHECK (EXTRACT(DAY FROM salary_end_month) = 1),

  CONSTRAINT project_participation_details_salary_month_range_check
    CHECK (salary_end_month >= salary_start_month),

  CONSTRAINT project_participation_details_monthly_salary_check
    CHECK (monthly_salary > 0),

  CONSTRAINT project_participation_details_total_salary_check
    CHECK (total_salary > 0),

  CONSTRAINT project_participation_details_calculated_points_check
    CHECK (calculated_points >= 0),

  CONSTRAINT project_participation_details_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT project_participation_details_rule_fk
    FOREIGN KEY (project_point_rule_id) REFERENCES project_point_rules (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT project_participation_details_application_unique
    UNIQUE (application_id)
);
```

業務規則由 Service 在 Transaction 內保證，包括：

- 一張參與計畫申請只允許一位 `application_participants`，且必須是申請人。
- `total_salary` 由 `monthly_salary * 月份數`（含 start 與 end）計算。
- `calculated_points` 由 `FLOOR(total_salary / salary_unit) * points_per_unit` 計算，並以申請使用的 `project_point_rules` 為準。

### `certificate_application_details`

```sql
CREATE TABLE certificate_application_details (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL,
  certificate_point_rule_id BIGINT NOT NULL,
  certificate_name VARCHAR(255) NOT NULL,
  issuing_organization VARCHAR(255) NOT NULL,
  certificate_number VARCHAR(100) NOT NULL,
  issued_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT certificate_application_details_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT certificate_application_details_rule_fk
    FOREIGN KEY (certificate_point_rule_id) REFERENCES certificate_point_rules (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT certificate_application_details_application_unique
    UNIQUE (application_id)
);
```

業務規則由 Service 保證：

- 申請建立時自動將 `application_participants.requested_points` 設為 `2`（依適用 `certificate_point_rules.points_per_certificate`）。
- 核准時 Service 在 Transaction 內查詢 `student_point_transactions` 中該學號的證照類累積點數，驗證核准後不會超過 `certificate_point_rules.maximum_points_per_student`。

### `external_exhibition_details`

```sql
CREATE TABLE external_exhibition_details (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL,
  exhibition_point_rule_id BIGINT NOT NULL,
  exhibition_type VARCHAR(40) NOT NULL,
  work_name VARCHAR(255) NOT NULL,
  exhibition_name VARCHAR(50) NOT NULL,
  exhibition_name_other VARCHAR(255),
  organizer VARCHAR(255) NOT NULL,
  venue VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT external_exhibition_details_exhibition_type_check
    CHECK (exhibition_type IN (
      'creative_work',
      'graduation_project_exhibition'
    )),

  CONSTRAINT external_exhibition_details_exhibition_name_check
    CHECK (exhibition_name IN (
      'campus_exhibition',
      'young_designers_exhibition',
      'vision_get_wild',
      'young_designers_exhibition_taiwan',
      'a_plus_creative_festival',
      'moe_project_competition',
      'other'
    )),

  CONSTRAINT external_exhibition_details_exhibition_name_other_pair_check
    CHECK (
      (exhibition_name = 'other' AND exhibition_name_other IS NOT NULL)
      OR
      (exhibition_name <> 'other' AND exhibition_name_other IS NULL)
    ),

  CONSTRAINT external_exhibition_details_date_range_check
    CHECK (end_date >= start_date),

  CONSTRAINT external_exhibition_details_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT external_exhibition_details_rule_fk
    FOREIGN KEY (exhibition_point_rule_id) REFERENCES exhibition_point_rules (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT external_exhibition_details_application_unique
    UNIQUE (application_id)
);
```

`exhibition_type` 的允許值與 `exhibition_point_rules.exhibition_type` 完全相同；雖然規則表本身已有 CHECK，類型專屬表也保留 CHECK 作為寫入防呆。

### 建立順序

1. 確認 `point_applications`、`application_participants` 與四張規則表已建立。
2. 依任意順序建立四張類型專屬資料表（彼此不互相依賴）。
3. 為每張表掛上 `set_updated_at()` Trigger。
