# Schema 設計規範

本文件描述所有 PostgreSQL 資料表共同遵守的技術規範，包括識別欄位、型別、外鍵、驗證分層、Constraint 與 Index。各資料表用途與欄位請參考 [資料模型](data-model.md)；完整 SQL 請參考 [資料庫 Schema](database-schema.md)。

## 識別欄位策略

所有資料表的內部主鍵統一使用 PostgreSQL 自動遞增 `BIGINT`，內部外鍵關聯也統一使用 `BIGINT`：

```sql
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
```

需要直接出現在 API URL、Email 連結或管理後台 URL 的資源，額外加入不可依序猜測的對外識別欄位：

```sql
public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid()
```

目前需要 `public_id` 的資料表：

- `point_applications`：申請 API、Email 簽核與補件相關 URL。
- `application_attachments`：附件存取 API。
- `student_point_change_requests`：管理後台點數異動申請 URL。

其他資料表通常透過上層資源存取，不需要額外加入 `public_id`。

資料規則：

- API 與 URL 不直接暴露內部 `BIGINT id`。
- Repository 透過 `public_id` 找到資源後，內部關聯與 Transaction 仍使用 `BIGINT id`。
- `public_id` 必須建立唯一索引。
- UUID 只能降低 ID 被依序猜測的風險，不能取代身分驗證、權限與資料所有權檢查。
- PostgreSQL 需啟用可提供 `gen_random_uuid()` 的擴充功能。

## 共用欄位型別規範

建立實際 PostgreSQL Schema 時，各資料表應遵守以下共用型別規範。

### 時間與日期

| 資料用途 | PostgreSQL 型別 | 規則 |
| --- | --- | --- |
| 建立、更新、登入、簽核與審核時間 | `TIMESTAMPTZ` | 儲存實際時間點，顯示時轉換為台北時區 |
| 競賽日期與證照日期 | `DATE` | 不保存時間與時區 |
| 展覽期間 | `start_date DATE`、`end_date DATE` | 不使用字串保存日期區間 |
| 領薪年月 | `DATE` | 固定保存該月份第一天 |
| 規則有效期間 | `effective_from DATE`、`effective_to DATE` | 使用半開區間；`effective_to` 當天開始失效，`NULL` 代表無限期有效 |

`created_at` 預設寫法：

```sql
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

具有 `updated_at` 的資料表，統一使用以下欄位定義：

```sql
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

`DEFAULT NOW()` 只能處理資料建立時間，因此所有具有 `updated_at` 的資料表都必須掛上共用 PostgreSQL Trigger，在每次更新資料列時自動更新時間：

```sql
CREATE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER point_applications_set_updated_at
BEFORE UPDATE ON point_applications
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
```

時間欄位規則：

- `updated_at` 只代表資料列最後修改時間，不代表最後一次業務操作時間。
- 提交、簽核、審核等重要事件仍使用 `submitted_at`、`signed_at`、`reviewed_at` 等專用欄位。
- API 更新 SQL 不需要自行設定 `updated_at`，避免各更新入口行為不一致。
- Migration 必須為每張具有 `updated_at` 的資料表建立 Trigger。

### 點數與金額

| 資料用途 | PostgreSQL 型別 | 規則 |
| --- | --- | --- |
| 申請、核准、規則與流水帳點數 | `NUMERIC(10, 2)` | 不使用浮點數，避免小數計算誤差 |
| 新台幣金額 | `BIGINT` | 以整數元保存，不保存小數 |

資料規則：

- 一般申請與規則點數必須大於或等於 `0`。
- 尚未審核的核准點數使用 `NULL`，不可使用 `0` 表示尚未審核。
- `student_point_transactions.points` 允許正數、負數或 `0`，以支援異動與沖銷。
- 金額欄位使用明確名稱，例如 `salary_amount` 與 `total_amount`。

### 字串與文字

| 資料用途 | PostgreSQL 型別 |
| --- | --- |
| Email | `VARCHAR(320)` |
| 姓名 | `VARCHAR(100)` |
| 學年度 | `VARCHAR(10)` |
| 年級、班級與職稱代碼 | `SMALLINT` |
| 學號 | `VARCHAR(50)` |
| 電話 | `VARCHAR(30)` |
| 名稱、標題與原始檔名 | `VARCHAR(255)` |
| URL 與私有檔案 `storage_key` | `TEXT` |
| 原因、備註、說明與工作概述 | `TEXT` |

只有存在明確業務或格式限制時才使用 `VARCHAR(n)`；不需要任意限制長度的文字使用 `TEXT`。

Email 在寫入前應移除前後空白並轉為小寫。登入帳號等需要忽略大小寫的 Email 欄位，應對正規化後的值建立唯一索引。

### 其他型別

| 資料用途 | PostgreSQL 型別 |
| --- | --- |
| 是非狀態 | `BOOLEAN NOT NULL DEFAULT FALSE` |
| 版本快照與結構化額外資料 | `JSONB` |
| IP 位址 | `INET` |
| 對外識別值 | `UUID` |

### `NULL` 與預設值

- 欄位預設使用 `NOT NULL`，只有資料確實可能不存在時才允許 `NULL`。
- 可選文字沒有內容時保存為 `NULL`，不使用空字串表示沒有資料。
- 尚未審核的 `approved_points`、尚未結束的 `effective_to`、未選擇其他選項的 `*_other`，以及尚未審核的 `reviewed_at` 可以是 `NULL`。
- 布林欄位應提供明確預設值，不使用 `NULL` 表示第三種狀態，除非業務上確實需要三態。

## 外鍵與刪除策略

第一版所有外鍵統一使用以下規則：

```sql
ON DELETE RESTRICT
ON UPDATE RESTRICT
```

採用此策略的原因：

- 寫入資料庫的申請都屬於正式紀錄，沒有資料庫草稿階段。
- 帳號、教師、申請、版本、附件、簽名、審核紀錄、通用稽核紀錄、點數規則與點數流水帳都具有歷史或稽核價值。
- `RESTRICT` 可以防止程式錯誤或管理操作意外刪除仍被引用的正式資料。
- 內部 `BIGINT` 主鍵建立後不得修改，因此外鍵不允許連帶更新。

刪除與停用規則：

- 帳號與教師不可實體刪除，改用 `is_active = false` 停用。
- 點數規則不可覆蓋或刪除，改用 `effective_to` 與新規則紀錄管理版本。
- 正式申請及其版本、附件、簽名與審核歷程不可實體刪除。
- 點數流水帳不可修改或刪除；錯誤點數透過異動或沖銷紀錄修正。
- 第一版不使用 `ON DELETE CASCADE`，因為不存在可連帶刪除的草稿或暫存附屬資料。
- 第一版不使用 `ON DELETE SET NULL`，避免失去原始操作者與資料來源關聯。

## 驗證與資料庫限制策略

系統採用分層驗證，先拒絕明顯錯誤的請求，再由 Service 與 PostgreSQL 保證業務規則及最終資料完整性：

```text
HTTP Request
  → Zod 請求格式驗證
  → Service 業務規則驗證
  → PostgreSQL Transaction、Constraint 與 Index
```

各層責任：

| 層級 | 責任 |
| --- | --- |
| Zod | 在進入 Service 與資料庫 Transaction 前，驗證請求格式、必填欄位、長度、數值範圍及可從單次 Request 判斷的欄位關係 |
| 上傳處理層 | 驗證附件數量、檔案大小、MIME type 與實際檔案內容 |
| Service | 驗證需要查詢資料庫的規則、目前流程狀態、跨資料列加總及資料所有權 |
| PostgreSQL | 使用 Transaction、外鍵、`CHECK`、`UNIQUE` 與 Index 保證最終資料完整性及處理併發衝突 |

Zod 應在開始資料庫 Transaction 與保存附件前完成驗證。不同申請類型使用 discriminated union，確保申請類型與專屬資料相符：

```ts
const applicationSchema = z.discriminatedUnion("applicationType", [
  competitionApplicationSchema,
  projectApplicationSchema,
  certificateApplicationSchema,
  externalExhibitionApplicationSchema,
]);
```

Zod 負責驗證：

- 必填欄位、字串長度、Email、日期、UUID、點數與金額格式。
- `applicationType` 對應的專屬表單內容。
- 選擇 `other` 時必須填寫對應的 `*_other` 欄位。
- 至少存在一位參與者、只能標記一位申請人，且申請人必須是參與者。
- Request 中參與者申請點數的加總與申請總點數一致。
- 附件 metadata 與附件數量是否符合 Request Schema。

Service 負責驗證：

- 指導老師是否存在且啟用。
- 申請使用的點數規則是否有效。
- 參與者點數是否符合適用規則。
- 證照核准後的學生累積點數是否超過上限。
- Token 是否有效，以及申請目前狀態是否允許操作。
- 需要查詢其他資料列、跨資料表或處理併發的規則。

即使 Request 已通過 Zod 與 Service 驗證，PostgreSQL Constraint 與 Index 仍必須保留，防止背景任務、管理腳本、程式遺漏及併發請求寫入不合法資料。

### `CHECK` Constraint

第一版至少建立以下單筆資料列限制：

```sql
CHECK (requested_points > 0)
CHECK (approved_points IS NULL OR approved_points >= 0)
CHECK (salary_amount > 0)
CHECK (minimum_points >= 0)
CHECK (maximum_points >= minimum_points)
CHECK (end_date >= start_date)
CHECK (effective_to IS NULL OR effective_to > effective_from)
```

`application_participants.requested_points` 必須大於 `0`（申請人不會替分到 `0` 點的參與者填寫名單）；`approved_points` 在核准前為 `NULL`，核准時允許為 `0`，因此使用 `IS NULL OR approved_points >= 0`。薪資月份明細的 `salary_amount` 必須大於 `0`；規則表的 `minimum_points`、`maximum_points` 屬於規則下限與上限，仍可為 `0`。

所有具有 `*_other` 欄位的選項，必須建立條件式 `CHECK`。例如：

```sql
CHECK (
  (competition_level_requested = 'other' AND competition_level_other IS NOT NULL)
  OR
  (competition_level_requested <> 'other' AND competition_level_other IS NULL)
)
```

審核欄位（如 `competition_level_approved`）審核前允許為 `NULL`，對應的 `*_approved_other` 也必須為 `NULL`；此類欄位需要三態 CHECK（兩端 NULL 或 兩端有值且符合 `'other'` 規則）。完整實作範例請參考 [資料庫 Schema](database-schema.md) 中各申請類型專屬資料表。

其他規則：

- `application_versions.version_number` 必須大於或等於 `1`。
- 一般申請、核准與規則點數不可為負數。
- `student_point_transactions.points` 允許正數、負數或 `0`，不建立非負數 `CHECK`。
- 狀態、角色、申請類型及固定選項第一版使用 `CHECK` 限制允許值，不使用 PostgreSQL Enum，方便規劃階段調整。

`CHECK` 不負責跨資料列或跨資料表規則，例如參與者點數加總、每筆申請必須存在一位申請人、證照累積上限，以及規則有效日期不可重疊。

### `UNIQUE` Constraint

第一版至少建立以下唯一限制：

| 資料表 | 唯一欄位 | 用途 |
| --- | --- | --- |
| `users` | 正規化後的 `email` | 登入 Email 不可重複 |
| 具有對外識別值的資料表 | `public_id` | 對外 UUID 在該資料表內不可重複 |
| 各申請類型專屬資料表 | `application_id` | 確保與申請為一對一關係 |
| `application_versions` | `(application_id, version_number)` | 同一申請不可有重複版本編號 |

### Partial Unique Index

第一版建立以下條件式唯一索引：

```sql
CREATE UNIQUE INDEX one_active_admin
ON users (role)
WHERE role = 'admin' AND is_active = TRUE;

CREATE UNIQUE INDEX one_active_director
ON advisors (is_director)
WHERE is_director = TRUE AND is_active = TRUE;

CREATE UNIQUE INDEX one_applicant_per_application
ON application_participants (application_id)
WHERE is_applicant = TRUE;

CREATE UNIQUE INDEX one_valid_signature_per_version
ON advisor_signatures (application_version_id)
WHERE invalidated_at IS NULL;

CREATE UNIQUE INDEX one_pending_change_per_transaction
ON student_point_change_requests (target_transaction_id)
WHERE status = 'pending';

CREATE UNIQUE INDEX one_award_per_participant
ON student_point_transactions (participant_id)
WHERE transaction_type = 'award';
```

Partial Unique Index 只能防止符合條件的資料重複。例如 `one_applicant_per_application` 能限制最多一位申請人，但無法保證一定存在申請人，因此送出申請時仍須由 Zod 與 Service 驗證。

### 一般查詢索引

一般非唯一索引依實際查詢需求建立。第一版至少需要：

- `student_point_transactions (student_number)`：學生點數彙總與查詢。
- `student_point_transactions (academic_year_snapshot, grade_snapshot, class_number_snapshot)`：公開點數總表依學年度、年級、班級代碼篩選，索引名稱建議使用 `idx_student_point_transactions_year_grade_class_number`。
- `student_point_transactions (academic_year_snapshot, student_number)`：公開點數總表依學年度與學號搜尋。
- `point_applications (status, submitted_at)`：承辦人待審核列表。
- `point_applications (advisor_id, status)`：指導老師查看自己的待簽核申請。
- Token Hash 欄位：帳號啟用、密碼重設、session 驗證及補件連結查詢。

索引會增加寫入及儲存成本；除上述核心查詢外，其餘索引應在 API 查詢設計完成後，依實際 SQL 與 `EXPLAIN ANALYZE` 結果補充。
