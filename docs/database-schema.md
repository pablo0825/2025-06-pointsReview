# 資料庫 Schema

本文件保存已確認、可轉換為 Migration 的 PostgreSQL SQL。邏輯資料表說明請參考 [資料模型](data-model.md)，共用技術規範請參考 [Schema 設計規範](schema-conventions.md)。

## Schema 完成狀態

- [x] `users`
- [x] `advisors`
- [x] `point_applications`
- [x] `application_participants`
- [x] 四種申請類型專屬資料表
- [x] 四種點數規則資料表
- [x] `application_attachments`
- [x] `application_review_actions`
- [x] `application_versions`
- [x] `advisor_signatures`
- [x] `student_point_change_requests`
- [x] `student_point_transactions`
- [x] `student_points_summary` View

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
  title_code SMALLINT NOT NULL,
  department VARCHAR(100) NOT NULL,
  is_director BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT advisors_title_code_check
    CHECK (title_code BETWEEN 1 AND 7),

  CONSTRAINT advisors_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);
```

欄位與資料規則：

- `user_id` 為 `NOT NULL` 且必須唯一，每位指導老師對應一個 `users` 帳號。
- `employee_number` 必須唯一，避免重複建立同一位教師資料。
- `title_code` 使用固定代碼：`1` 專任講師、`2` 專任助理教授、`3` 專任助理教授級專業技術人員、`4` 專任副教授、`5` 專任副教授級專業技術人員、`6` 專任教授、`7` 特聘教授；顯示文字由 API 或前端依對照表產生。
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
  closed_at TIMESTAMPTZ,
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

  CONSTRAINT point_applications_closed_at_check
    CHECK (
      (status IN ('approved', 'rejected') AND closed_at IS NOT NULL)
      OR
      (status NOT IN ('approved', 'rejected') AND closed_at IS NULL)
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
- `closed_at` 代表申請流程結束時間；只有 `approved` 與 `rejected` 終止狀態可以且必須有值，其他狀態必須為 `NULL`。
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

## `application_versions`

```sql
CREATE TABLE application_versions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL,
  version_number SMALLINT NOT NULL,
  application_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT application_versions_version_number_check
    CHECK (version_number >= 1),

  CONSTRAINT application_versions_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT application_versions_application_version_unique
    UNIQUE (application_id, version_number)
);
```

欄位與資料規則：

- `application_versions` 為**不可變的歷史快照**。資料表沒有 `updated_at`，**不掛 `set_updated_at()` Trigger**。
- `application_snapshot` 的最小欄位集合與不包含的內容（審核結果、附件 metadata）請參考 [資料模型](data-model.md#申請版本-application_versions)。
- `UNIQUE (application_id, version_number)` 保證同一筆申請不會出現重複版本編號。

另外為支援 `point_applications.current_version_id` 複合外鍵，必須額外加入 `UNIQUE (id, application_id)` 約束；詳細 ALTER TABLE 寫法、循環外鍵與首次送件 Transaction 範例請參考下一節。

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
  academic_year VARCHAR(10) NOT NULL,
  grade SMALLINT NOT NULL,
  class_number SMALLINT NOT NULL,
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

  CONSTRAINT application_participants_grade_check
    CHECK (grade BETWEEN 1 AND 6),

  CONSTRAINT application_participants_class_number_check
    CHECK (class_number BETWEEN 1 AND 5),

  CONSTRAINT application_participants_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT application_participants_application_student_unique
    UNIQUE (application_id, student_number),

  CONSTRAINT application_participants_id_application_unique
    UNIQUE (id, application_id)
);
```

欄位與資料規則：

- `requested_points` 必須大於 `0`；`approved_points` 在核准前為 `NULL`，核准時允許為 `0`。
- `academic_year`、`grade`、`class_number` 保存申請送件當下的學生歸屬；`grade = 1..4` 代表一年級至四年級，`grade = 5..6` 代表碩一至碩二，`class_number = 1..5` 代表甲班至戊班。
- 顯示名稱由 API 或前端依 `grade` 與 `class_number` 對照表產生，例如 `grade = 3`、`class_number = 1` 顯示為「三年甲班」。
- 申請人姓名（`is_applicant = TRUE` 的 `student_name`）與 `point_applications.applicant_name` 的一致性、參與者點數加總與申請總點數的一致性，皆由 Service 在 Transaction 內驗證，資料庫層不建立跨表 `CHECK` 或 Trigger。
- 補件採就地 `UPDATE`／`DELETE`／`INSERT`，歷史依賴 `application_versions.application_snapshot`。
- `application_participants` 必須掛上共用 `set_updated_at()` Trigger。
- `UNIQUE (id, application_id)` 給 `student_point_transactions` 的複合外鍵使用，確保流水帳的 `participant_id` 與 `application_id` 屬於同一筆申請；`id` 本身為 PK 自然唯一，加上此複合 UNIQUE 不影響原有業務語意。

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

## `advisor_signatures`

```sql
CREATE TABLE advisor_signatures (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_version_id BIGINT NOT NULL,
  advisor_user_id BIGINT NOT NULL,
  signature_storage_key TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL,
  invalidated_at TIMESTAMPTZ,
  invalidated_reason TEXT,
  ip_address INET NOT NULL,
  user_agent TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT advisor_signatures_invalidation_pair_check
    CHECK (
      (invalidated_at IS NULL AND invalidated_reason IS NULL)
      OR
      (invalidated_at IS NOT NULL AND invalidated_reason IS NOT NULL)
    ),

  CONSTRAINT advisor_signatures_application_version_fk
    FOREIGN KEY (application_version_id) REFERENCES application_versions (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT advisor_signatures_advisor_user_fk
    FOREIGN KEY (advisor_user_id) REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);
```

欄位與資料規則：

- 沒有 `updated_at`，**不掛 `set_updated_at()` Trigger**。
- 簽名失效採 UPDATE 既有紀錄（`invalidated_at` 與 `invalidated_reason` 同時寫入），不 INSERT 失效紀錄。
- `advisor_user_id` 對應 `users.id`；該帳號必須是該申請的指導老師（透過 `advisors.user_id` 與 `point_applications.advisor_id` 對應），由 Service 在 Transaction 內驗證。
- `invalidated_reason` 為自由文字，目前僅有「補件提交導致失效」一種情境，未來如需區分多種原因可改為列舉欄位。

索引：

```sql
CREATE UNIQUE INDEX one_valid_signature_per_version
ON advisor_signatures (application_version_id)
WHERE invalidated_at IS NULL;
```

`one_valid_signature_per_version` Partial Unique Index 保證每個版本最多只能有一筆 `invalidated_at IS NULL` 的有效簽名。配合補件流程，舊版本簽名先 UPDATE `invalidated_at`，再 INSERT 新版本的簽名，不會觸發唯一性衝突。

建立順序：

1. 確認 `users` 與 `application_versions` 已建立。
2. 建立 `advisor_signatures`。
3. 建立 `one_valid_signature_per_version` Partial Unique Index。

## `application_attachments`

```sql
CREATE TABLE application_attachments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid(),
  application_id BIGINT NOT NULL,
  application_version_id BIGINT NOT NULL,
  attachment_type VARCHAR(50) NOT NULL,
  attachment_type_other VARCHAR(100),
  description TEXT,
  original_filename VARCHAR(255) NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT application_attachments_attachment_type_check
    CHECK (attachment_type IN (
      'competition_rules',
      'competition_poster',
      'official_website_screenshot',
      'official_document',
      'participation_proof',
      'finalist_or_award_certificate',
      'salary_proof',
      'certificate_copy',
      'exhibition_photo',
      'exhibition_poster',
      'other'
    )),

  CONSTRAINT application_attachments_attachment_type_other_pair_check
    CHECK (
      (attachment_type = 'other' AND attachment_type_other IS NOT NULL)
      OR
      (attachment_type <> 'other' AND attachment_type_other IS NULL)
    ),

  CONSTRAINT application_attachments_file_size_check
    CHECK (file_size > 0),

  CONSTRAINT application_attachments_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT application_attachments_version_application_fk
    FOREIGN KEY (application_version_id, application_id)
    REFERENCES application_versions (id, application_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);
```

欄位與資料規則：

- `application_attachments` 為不可變紀錄，沒有 `updated_at`，**不掛 `set_updated_at()` Trigger**。
- 補件保留附件採 INSERT 新 row 的設計，允許多筆 row 共用同一 `storage_key`；因此 `storage_key` 本身不建立全域 UNIQUE。
- 複合外鍵 `(application_version_id, application_id) → application_versions (id, application_id)` 確保附件的版本確實屬於同一筆申請；複用 `application_versions` 為循環外鍵建立的 `UNIQUE (id, application_id)`。
- 每筆申請最多 10 個附件、每檔最多 5 MB、檔案格式限制 PDF/JPEG/PNG 等規則，由上傳處理層與 Service 保證，資料庫層不建立額外 CHECK 以保留調整彈性。
- 各申請類型最低附件要求（如競賽申請需 `participation_proof` 或 `finalist_or_award_certificate`）由 Service 在送件 Transaction 內驗證。

索引：

```sql
CREATE UNIQUE INDEX application_attachments_public_id_unique
ON application_attachments (public_id);

CREATE UNIQUE INDEX application_attachments_version_storage_unique
ON application_attachments (application_version_id, storage_key);

CREATE INDEX idx_application_attachments_application_id
ON application_attachments (application_id);
```

`application_attachments_version_storage_unique` 防止同一版本內 INSERT 兩筆指向同檔案的 row。`idx_application_attachments_application_id` 加速「列出某申請所有版本的附件」查詢；雖然 `application_attachments_version_application_fk` 已涉及 `application_id`，但 PostgreSQL 並不自動為複合 FK 的所有前綴欄位建立 index。

建立順序：

1. 確認 `point_applications` 與 `application_versions` 已建立，且 `application_versions` 已有 `UNIQUE (id, application_id)`。
2. 建立 `application_attachments`。
3. 建立三個索引。

## `application_review_actions`

```sql
CREATE TABLE application_review_actions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL,
  actor_user_id BIGINT,
  actor_type VARCHAR(20) NOT NULL,
  action_type VARCHAR(40) NOT NULL,
  reason TEXT,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT application_review_actions_actor_type_check
    CHECK (actor_type IN ('advisor', 'reviewer', 'applicant', 'system')),

  CONSTRAINT application_review_actions_action_type_check
    CHECK (action_type IN (
      'advisor_approved',
      'advisor_rejected',
      'revision_requested',
      'resubmitted',
      'reviewer_approved',
      'reviewer_rejected',
      'revision_expired',
      'advisor_confirmation_expired'
    )),

  CONSTRAINT application_review_actions_actor_pair_check
    CHECK (
      (actor_type IN ('applicant', 'system') AND actor_user_id IS NULL)
      OR
      (actor_type IN ('advisor', 'reviewer') AND actor_user_id IS NOT NULL)
    ),

  CONSTRAINT application_review_actions_audit_fields_check
    CHECK (
      (actor_type = 'system' AND ip_address IS NULL AND user_agent IS NULL)
      OR
      (actor_type <> 'system' AND ip_address IS NOT NULL AND user_agent IS NOT NULL)
    ),

  CONSTRAINT application_review_actions_reason_required_check
    CHECK (
      action_type IN ('advisor_approved', 'resubmitted', 'reviewer_approved')
      OR reason IS NOT NULL
    ),

  CONSTRAINT application_review_actions_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT application_review_actions_actor_user_fk
    FOREIGN KEY (actor_user_id) REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);
```

欄位與資料規則：

- `application_review_actions` 為不可變稽核紀錄，沒有 `updated_at`，**不掛 `set_updated_at()` Trigger**。
- 不保留 `reviewer_adjusted` 作為獨立 action；承辦人核准若含調整，寫入 `reviewer_approved` 並將調整資料保存於 `metadata`，`reason` 必填（由 Service 驗證）。
- `actor_user_id` 在 `applicant` 與 `system` 操作時為 `NULL`；由 `actor_pair_check` 強制。
- `ip_address` 與 `user_agent` 僅在 `system` 操作時為 `NULL`；由 `audit_fields_check` 強制。
- `reason_required_check` 排除三個本身不要求 `reason` 的 action（`advisor_approved`、`resubmitted`、`reviewer_approved`），其他 action 都必須有 `reason`。`reviewer_approved` 含調整時是否要 `reason` 由 Service 依 `metadata` 內容驗證。
- `metadata` 預設為 `NULL`，僅在有調整時寫入結構化資料。
- 不可實體刪除既有紀錄。

索引：

```sql
CREATE INDEX idx_application_review_actions_application_created
ON application_review_actions (application_id, created_at);

CREATE INDEX idx_application_review_actions_actor_created
ON application_review_actions (actor_user_id, created_at)
WHERE actor_user_id IS NOT NULL;
```

`idx_application_review_actions_application_created` 加速「列出某申請的審核歷史按時間排序」查詢。`idx_application_review_actions_actor_created` 加速「列出某使用者操作過的審核紀錄」，使用 Partial Index 排除 `applicant`／`system` 操作（這類紀錄不需要按 user 查）。

建立順序：

1. 確認 `point_applications` 與 `users` 已建立。
2. 建立 `application_review_actions`。
3. 建立兩個索引。

## `student_point_transactions`

```sql
CREATE TABLE student_point_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_number VARCHAR(50) NOT NULL,
  student_name_snapshot VARCHAR(100) NOT NULL,
  academic_year_snapshot VARCHAR(10) NOT NULL,
  grade_snapshot SMALLINT NOT NULL,
  class_number_snapshot SMALLINT NOT NULL,
  application_id BIGINT NOT NULL,
  participant_id BIGINT NOT NULL,
  point_category VARCHAR(30) NOT NULL,
  points NUMERIC(10, 2) NOT NULL,
  transaction_type VARCHAR(20) NOT NULL,
  related_transaction_id BIGINT,
  reason TEXT,
  created_by_user_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT student_point_transactions_point_category_check
    CHECK (point_category IN (
      'competition',
      'certificate',
      'project_participation',
      'external_exhibition'
    )),

  CONSTRAINT student_point_transactions_transaction_type_check
    CHECK (transaction_type IN ('award', 'adjustment', 'reversal')),

  CONSTRAINT student_point_transactions_related_pair_check
    CHECK (
      (transaction_type = 'award'
        AND related_transaction_id IS NULL
        AND reason IS NULL)
      OR
      (transaction_type IN ('adjustment', 'reversal')
        AND related_transaction_id IS NOT NULL
        AND reason IS NOT NULL)
    ),

  CONSTRAINT student_point_transactions_grade_snapshot_check
    CHECK (grade_snapshot BETWEEN 1 AND 6),

  CONSTRAINT student_point_transactions_class_number_snapshot_check
    CHECK (class_number_snapshot BETWEEN 1 AND 5),

  CONSTRAINT student_point_transactions_application_fk
    FOREIGN KEY (application_id) REFERENCES point_applications (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT student_point_transactions_participant_application_fk
    FOREIGN KEY (participant_id, application_id)
    REFERENCES application_participants (id, application_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT student_point_transactions_related_fk
    FOREIGN KEY (related_transaction_id) REFERENCES student_point_transactions (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT student_point_transactions_created_by_user_fk
    FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);
```

欄位與資料規則：

- `student_point_transactions` 為不可變稽核紀錄，沒有 `updated_at`，**不掛 `set_updated_at()` Trigger**；不可實體刪除，由 application 層保證沒有 DELETE／UPDATE endpoint。
- `student_name_snapshot`、`academic_year_snapshot`、`grade_snapshot`、`class_number_snapshot` 保存點數建立當下的不可變快照。
- `points` 允許正數、負數或 `0`，不建立非負數 `CHECK`，以支援 `adjustment` 與 `reversal`。
- 複合外鍵 `(participant_id, application_id) → application_participants (id, application_id)` 確保流水帳的 participant 與 application 屬於同一筆申請；複用 `application_participants.UNIQUE (id, application_id)`。
- `related_transaction_id` 為自我參照外鍵，僅在 `adjustment` 與 `reversal` 時非 `NULL`，指向被調整的原始 `award` 紀錄。
- `award` 的快照欄位取自核准當下的 `application_participants`；`adjustment` 與 `reversal` 沿用目標原始 `award` 的快照欄位，讓更正點數歸回原始年度與班級。
- `point_category` 必須對應該申請的 `application_type`，由 Service 在 Transaction 內驗證。
- `adjustment` 與 `reversal` 的 `created_by_user_id` 必須為管理員，由 Service 驗證。

索引：

```sql
CREATE INDEX idx_student_point_transactions_student_number
ON student_point_transactions (student_number);

CREATE INDEX idx_student_point_transactions_student_category
ON student_point_transactions (student_number, point_category);

CREATE INDEX idx_student_point_transactions_year_grade_class_number
ON student_point_transactions (
  academic_year_snapshot,
  grade_snapshot,
  class_number_snapshot
);

CREATE INDEX idx_student_point_transactions_year_student
ON student_point_transactions (academic_year_snapshot, student_number);

CREATE INDEX idx_student_point_transactions_application_id
ON student_point_transactions (application_id);

CREATE INDEX idx_student_point_transactions_related_transaction_id
ON student_point_transactions (related_transaction_id)
WHERE related_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX one_award_per_participant
ON student_point_transactions (participant_id)
WHERE transaction_type = 'award';
```

各索引用途：

- `idx_student_point_transactions_student_number`：學生跨年度點數查詢與彙總。
- `idx_student_point_transactions_student_category`：學生跨年度依類別加總時加速。
- `idx_student_point_transactions_year_grade_class_number`：公開總表依學年度、年級、班級代碼篩選。
- `idx_student_point_transactions_year_student`：公開總表依學年度與學號搜尋。
- `idx_student_point_transactions_application_id`：列出某申請產生的所有點數紀錄。
- `idx_student_point_transactions_related_transaction_id`：查某筆原始 `award` 後續被哪些 `adjustment`／`reversal` 調整過。
- `one_award_per_participant`：保證每位參與者最多只能有一筆 `award` 紀錄。

建立順序：

1. 確認 `point_applications`、`application_participants`（含 `UNIQUE (id, application_id)`）與 `users` 已建立。
2. 建立 `student_point_transactions`。
3. 建立七個索引。

## `student_point_change_requests`

```sql
CREATE TABLE student_point_change_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid(),
  target_transaction_id BIGINT NOT NULL,
  requested_by_user_id BIGINT NOT NULL,
  reviewed_by_user_id BIGINT,
  change_type VARCHAR(20) NOT NULL,
  requested_points NUMERIC(10, 2) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  reviewed_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_transaction_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT student_point_change_requests_change_type_check
    CHECK (change_type IN ('adjustment', 'reversal')),

  CONSTRAINT student_point_change_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected')),

  CONSTRAINT student_point_change_requests_requested_points_check
    CHECK (requested_points <> 0),

  CONSTRAINT student_point_change_requests_status_fields_check
    CHECK (
      (status = 'pending'
        AND reviewed_by_user_id IS NULL
        AND reviewed_at IS NULL
        AND reviewed_reason IS NULL
        AND created_transaction_id IS NULL)
      OR
      (status = 'approved'
        AND reviewed_by_user_id IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND created_transaction_id IS NOT NULL)
      OR
      (status = 'rejected'
        AND reviewed_by_user_id IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND reviewed_reason IS NOT NULL
        AND created_transaction_id IS NULL)
    ),

  CONSTRAINT student_point_change_requests_target_fk
    FOREIGN KEY (target_transaction_id) REFERENCES student_point_transactions (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT student_point_change_requests_requested_by_user_fk
    FOREIGN KEY (requested_by_user_id) REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT student_point_change_requests_reviewed_by_user_fk
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,

  CONSTRAINT student_point_change_requests_created_transaction_fk
    FOREIGN KEY (created_transaction_id) REFERENCES student_point_transactions (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);
```

欄位與資料規則：

- 多態 `CHECK` 強制三種 `status` 對應的欄位狀態，避免出現「approved 但 created_transaction_id NULL」等不一致。
- `requested_points <> 0` 由資料庫保證；正負方向與業務上限（adjustment 後不得 < 0、reversal 必須等於原始相反數）由 Service 驗證。
- 不保存 `ip_address` 與 `user_agent`；詳細稽核依賴規劃中的 `audit_logs` 表（見 [待決策項目](open-decisions.md#4-通用系統稽核紀錄)）。
- `requested_by_user_id` 應為承辦人，`reviewed_by_user_id` 應為管理員，由 Service 依 `users.role` 驗證。
- `student_point_change_requests` 必須掛上共用 `set_updated_at()` Trigger（status 從 `pending` 變更時會 UPDATE）。

索引：

```sql
CREATE UNIQUE INDEX student_point_change_requests_public_id_unique
ON student_point_change_requests (public_id);

CREATE UNIQUE INDEX one_pending_change_per_transaction
ON student_point_change_requests (target_transaction_id)
WHERE status = 'pending';

CREATE UNIQUE INDEX one_change_per_created_transaction
ON student_point_change_requests (created_transaction_id)
WHERE created_transaction_id IS NOT NULL;

CREATE INDEX idx_student_point_change_requests_status_created
ON student_point_change_requests (status, created_at);

CREATE INDEX idx_student_point_change_requests_requested_by_user
ON student_point_change_requests (requested_by_user_id);
```

各索引用途：

- `student_point_change_requests_public_id_unique`：對外管理後台 URL 查詢。
- `one_pending_change_per_transaction`：同一筆原始點數同時間最多只能有一筆 `pending` 異動申請。
- `one_change_per_created_transaction`：一筆 `student_point_transactions` 最多只能由一筆 change_request 建立。
- `idx_status_created`：管理員待審列表。
- `idx_requested_by_user`：承辦人查自己提出的異動申請。

建立順序：

1. 確認 `student_point_transactions` 與 `users` 已建立。
2. 建立 `student_point_change_requests`。
3. 建立五個索引。
4. 為 `student_point_change_requests` 掛上 `set_updated_at()` Trigger。

## `student_points_summary` View

從 `student_point_transactions` 即時加總每位學生在某學年度、年級、班級下的各類別累積點數。第一版使用 PostgreSQL View，不維護實體 Materialized View。

```sql
CREATE VIEW student_points_summary AS
WITH latest_snapshot AS (
  SELECT DISTINCT ON (
    academic_year_snapshot,
    grade_snapshot,
    class_number_snapshot,
    student_number
  )
    academic_year_snapshot AS academic_year,
    grade_snapshot AS grade,
    class_number_snapshot AS class_number,
    student_number,
    student_name_snapshot AS student_name
  FROM student_point_transactions
  ORDER BY
    academic_year_snapshot,
    grade_snapshot,
    class_number_snapshot,
    student_number,
    created_at DESC
)
SELECT
  t.academic_year_snapshot AS academic_year,
  t.grade_snapshot AS grade,
  t.class_number_snapshot AS class_number,
  t.student_number,
  ls.student_name,
  COALESCE(SUM(t.points) FILTER (
    WHERE t.point_category = 'competition'
  ), 0) AS competition_points,
  COALESCE(SUM(t.points) FILTER (
    WHERE t.point_category = 'project_participation'
  ), 0) AS project_participation_points,
  COALESCE(SUM(t.points) FILTER (
    WHERE t.point_category = 'certificate'
  ), 0) AS certificate_points,
  COALESCE(SUM(t.points) FILTER (
    WHERE t.point_category = 'external_exhibition'
  ), 0) AS external_exhibition_points,
  COALESCE(SUM(t.points), 0) AS total_points,
  MAX(t.created_at) AS updated_at
FROM student_point_transactions t
JOIN latest_snapshot ls
  ON ls.academic_year = t.academic_year_snapshot
  AND ls.grade = t.grade_snapshot
  AND ls.class_number = t.class_number_snapshot
  AND ls.student_number = t.student_number
GROUP BY
  t.academic_year_snapshot,
  t.grade_snapshot,
  t.class_number_snapshot,
  t.student_number,
  ls.student_name;
```

設計說明：

- View 依 `academic_year_snapshot`、`grade_snapshot`、`class_number_snapshot`、`student_number` 分組，代表「某學年度、某年級／班級下的點數摘要」。
- 透過 `DISTINCT ON (...) ORDER BY ... created_at DESC` 取得同一分組內最後一次點數異動寫入時的姓名快照，避免 `MAX(name)` 取到字串最大值的錯誤行為。
- 各類別總點數使用 `SUM(points) FILTER (WHERE point_category = ...)`，並以 `COALESCE(..., 0)` 處理無紀錄情形。
- `updated_at` 為該學年度、年級、班級與學生分組內「最後一筆點數異動建立時間」，作為資料新鮮度顯示。
- View 回傳完整 `student_number` 與 `student_name`；公開 API 必須在回傳前以遮罩格式輸出（見 [點數系統](point-system.md#公開資料遮罩)）。
- 若日後需要學生生涯累積總表，應另建 `student_lifetime_points_summary` View；該 View 才適合顯示 latest grade／latest class。
- 若日後資料量增加導致即時計算成本過高，可改為 Materialized View 並排程 `REFRESH MATERIALIZED VIEW`。

建立順序：

1. 確認 `student_point_transactions` 已建立並完成索引。
2. 建立 `student_points_summary` View。
