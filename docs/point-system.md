# 點數系統

本文件描述點數規則、計算方式、規則版本、學生點數流水帳、核准後異動與公開點數總表。申請核心資料表請參考 [資料模型](data-model.md)，共用資料庫限制請參考 [Schema 設計規範](schema-conventions.md)。

## 競賽點數規則 `competition_point_rules`

定義競賽等級與獎項對應的點數規則。規則不直接寫死在 API 或資料庫 `CHECK` constraint 中，避免規則調整時需要修改程式並重新部署。資料表欄位、允許值與 Constraint 請參考 [資料模型 - competition_point_rules](data-model.md#競賽點數規則-competition_point_rules)。

`allocation_method` 業務語意：

| 值 | 說明 |
| --- | --- |
| `per_person` | 每位參與者各自取得固定點數 |
| `shared_total` | 所有參與者共同分配固定總點數 |

目前競賽點數規則：

| 競賽等級 | 獎項 | 分配方式 | 點數 |
| --- | --- | --- | ---: |
| `international_integrated` | `participation` | `per_person` | 1 |
| `international_integrated` | `finalist` | `per_person` | 10 |
| `international_integrated` | `honorable_mention` | `shared_total` | 60 |
| `international_integrated` | `third_place` | `shared_total` | 80 |
| `international_integrated` | `second_place` | `shared_total` | 100 |
| `international_integrated` | `first_place` | `shared_total` | 120 |
| `international_non_integrated` | `participation` | `per_person` | 0.5 |
| `international_non_integrated` | `finalist` | `per_person` | 2 |
| `international_non_integrated` | `honorable_mention` | `shared_total` | 5 |
| `international_non_integrated` | `third_place` | `shared_total` | 10 |
| `international_non_integrated` | `second_place` | `shared_total` | 15 |
| `international_non_integrated` | `first_place` | `shared_total` | 25 |
| `national_integrated` | `participation` | `per_person` | 0.5 |
| `national_integrated` | `finalist` | `per_person` | 3 |
| `national_integrated` | `honorable_mention` | `shared_total` | 25 |
| `national_integrated` | `third_place` | `shared_total` | 30 |
| `national_integrated` | `second_place` | `shared_total` | 40 |
| `national_integrated` | `first_place` | `shared_total` | 60 |
| `national_non_integrated` | `participation` | `per_person` | 0.5 |
| `national_non_integrated` | `finalist` | `per_person` | 1.5 |
| `national_non_integrated` | `honorable_mention` | `shared_total` | 3 |
| `national_non_integrated` | `third_place` | `shared_total` | 5 |
| `national_non_integrated` | `second_place` | `shared_total` | 10 |
| `national_non_integrated` | `first_place` | `shared_total` | 20 |
| `other` | `participation` | `per_person` | 0.5 |
| `other` | `finalist` | `per_person` | 0.5 |
| `other` | `honorable_mention` | `shared_total` | 1 |
| `other` | `third_place` | `shared_total` | 2 |
| `other` | `second_place` | `shared_total` | 3 |
| `other` | `first_place` | `shared_total` | 4 |

點數計算與驗證規則：

- `per_person`：每位參與者的 `requested_points` 必須等於規則的 `points`，申請總點數為規則點數乘以參與人數。
- `shared_total`：所有參與者的 `requested_points` 加總必須等於規則的 `points`，申請人可以自行分配每位參與者點數。
- 送件時，API Service 層依競賽等級、獎項與申請日期查詢有效規則。
- API Service 層負責驗證參與者點數並自動計算 `requested_total_points`。
- 建立申請時保存 `competition_point_rule_id`，用來記錄該申請使用的歷史規則。
- 規則調整時建立新的規則紀錄，不修改已被申請使用的舊規則。
- 建議限制 `points >= 0`，並避免相同競賽等級與獎項存在時間重疊的有效規則。

資料庫負責保存規則與基本資料限制；API Service 層負責查詢規則、執行點數計算及業務驗證。

## 參與計畫點數規則 `project_point_rules`

定義參與計畫薪資換算點數的規則與歷史版本。資料表欄位與 Constraint 請參考 [資料模型 - project_point_rules](data-model.md#參與計畫點數規則-project_point_rules)。

目前規則：

```text
每 1,000 元換 0.5 點，無上限。
不足 1,000 元的部分不計點。
```

計算公式：

```text
calculated_points =
FLOOR(total_salary / salary_unit) * points_per_unit
```

範例：

| 計畫 | 總薪資 | 計算點數 |
| --- | ---: | ---: |
| A 計畫 | 5,000 元 | 2.5 |
| B 計畫 | 1,000 元 | 0.5 |

學生最終可透過點數流水帳查得參與計畫類別合計 `3` 點，但 A、B 計畫在申請與計算時保持獨立。

送件時，API Service 層查詢有效的 `project_point_rules`，自動計算 `total_salary`、`calculated_points` 與申請點數，並將使用的規則保存於 `project_point_rule_id`。

規則調整時建立新的規則紀錄，不修改已被申請使用的舊規則。

## 證照點數規則 `certificate_point_rules`

定義證照點數及每位學生證照類累積上限的規則與歷史版本。資料表欄位與 Constraint 請參考 [資料模型 - certificate_point_rules](data-model.md#證照點數規則-certificate_point_rules)。目前 `points_per_certificate` 為 `2`、`maximum_points_per_student` 為 `4`。

送件時，API Service 層查詢有效的 `certificate_point_rules`，自動將申請人的 `requested_points` 設為 `2`，並保存使用的 `certificate_point_rule_id`。

核准時，API Service 層需要：

1. 依學生學號查詢 `student_point_transactions` 中證照類別的目前累積點數。
2. 驗證核准本次證照後，累積點數不會超過 `maximum_points_per_student`。
3. 在同一個 PostgreSQL Transaction 中完成申請核准與建立點數流水帳。
4. 使用適當的資料庫鎖定或序列化機制，避免同一位學生的多筆證照申請同時核准而突破上限。

規則調整時建立新的規則紀錄，不修改已被申請使用的舊規則。

## 校外展覽點數規則 `exhibition_point_rules`

定義不同展覽類型可申請的每人點數範圍與歷史版本。資料表欄位與 Constraint 請參考 [資料模型 - exhibition_point_rules](data-model.md#校外展覽點數規則-exhibition_point_rules)。

目前規則：

| 展覽類型 | 每人最低點數 | 每人最高點數 |
| --- | ---: | ---: |
| `creative_work` | 0.5 | 1 |
| `graduation_project_exhibition` | 1 | 2 |

資料規則：

- `minimum_points_per_person` 必須小於或等於 `maximum_points_per_person`。
- 每位參與者的 `requested_points` 必須位於適用規則的點數範圍內。
- 送件時，API Service 層依展覽類型與首次送件時間查詢有效規則。
- 建立申請時保存 `exhibition_point_rule_id`，用來記錄該申請使用的歷史規則。
- 管理員可透過規則管理 API 建立未來生效的新規則，但不可覆蓋舊規則。

## 點數規則版本管理共用政策

以下政策適用於：

- `competition_point_rules`
- `project_point_rules`
- `certificate_point_rules`
- `exhibition_point_rules`

四張規則表皆**不包含 `is_active` 欄位**。規則的生命週期完全由 `effective_from` 與 `effective_to` 控制，避免出現 `is_active = TRUE` 但 `effective_to` 已過期之類的語意衝突。需要立即停用某條規則時，將其 `effective_to` 更新為今日日期即可（在同一 Transaction 中視需要建立新規則）。

規則適用日期以 `point_applications.submitted_at` 首次送件時間為準，不使用活動日期、補件日期或核准日期。

所有規則有效期間統一使用半開區間 `[effective_from, effective_to)`：

- `effective_from` 當天開始有效。
- `effective_to` 當天開始失效，不包含該日。
- `effective_to IS NULL` 代表沒有預定失效日期。
- `effective_to` 有值時，必須大於 `effective_from`。

例如舊規則的 `effective_to = 2026-08-01`，新規則的 `effective_from = 2026-08-01`，代表舊規則有效至 `2026-07-31`，新規則從 `2026-08-01` 開始有效，兩者不會重疊。

送件時，API Service 層依首次送件時間查詢有效規則：

```sql
WHERE daterange(effective_from, effective_to, '[)')
      @> (submitted_at AT TIME ZONE 'Asia/Taipei')::date
```

建立申請後，專屬申請資料會保存適用的規則 ID。後續補件、重新簽名與核准都沿用原本規則，即使期間已有新規則生效，也不影響已提交申請。

管理員調整規則時：

1. 不可修改或刪除已生效、已被申請使用的舊規則。
2. 設定舊規則的 `effective_to`。
3. 建立包含新內容與新 `effective_from` 的規則。
4. 同一規則類型的有效日期範圍不得重疊。
5. 新規則只適用於生效後首次提交的申請。
6. 保存管理員建立與停用規則的操作紀錄。

### 防止規則有效日期重疊

Service 在建立規則前應先檢查日期是否重疊，並向管理員回傳容易理解的錯誤訊息。PostgreSQL 仍須使用 Exclusion Constraint 作為最終限制，避免兩個同時執行的請求建立重疊規則。

Migration 必須先啟用 `btree_gist`：

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

各規則表判斷「同一種規則」的方式：

| 規則表 | 不可重疊的規則單位 |
| --- | --- |
| `competition_point_rules` | 相同 `competition_level` 與 `award` |
| `project_point_rules` | 整張表共用同一種規則 |
| `certificate_point_rules` | 整張表共用同一種規則 |
| `exhibition_point_rules` | 相同 `exhibition_type` |

資料庫限制：

```sql
ALTER TABLE competition_point_rules
ADD CONSTRAINT competition_point_rules_no_overlap
EXCLUDE USING gist (
  competition_level WITH =,
  award WITH =,
  daterange(effective_from, effective_to, '[)') WITH &&
);

ALTER TABLE project_point_rules
ADD CONSTRAINT project_point_rules_no_overlap
EXCLUDE USING gist (
  daterange(effective_from, effective_to, '[)') WITH &&
);

ALTER TABLE certificate_point_rules
ADD CONSTRAINT certificate_point_rules_no_overlap
EXCLUDE USING gist (
  daterange(effective_from, effective_to, '[)') WITH &&
);

ALTER TABLE exhibition_point_rules
ADD CONSTRAINT exhibition_point_rules_no_overlap
EXCLUDE USING gist (
  exhibition_type WITH =,
  daterange(effective_from, effective_to, '[)') WITH &&
);
```

管理員切換規則時，必須在同一個 Transaction 中設定舊規則的 `effective_to` 並建立新規則。若日期重疊，Exclusion Constraint 會拒絕整個操作。

例如：

| 展覽類型 | 最低點數 | 最高點數 | `effective_from` | `effective_to` |
| --- | ---: | ---: | --- | --- |
| `creative_work` | 0.5 | 1 | 2025-08-01 | 2026-08-01 |
| `creative_work` | 1 | 1.5 | 2026-08-01 | `NULL` |

## 學生點數異動申請 `student_point_change_requests`

承辦人針對核准後點數提出的異動或沖銷申請。承辦人只能提出申請，不能直接修改學生點數流水帳；管理員核准後，系統才建立實際的點數異動紀錄。資料表欄位、`change_type`／`status` 允許值、Constraint 與 partial unique index 請參考 [資料模型 - student_point_change_requests](data-model.md#學生點數異動申請-student_point_change_requests)。

操作流程：

1. 承辦人選擇原始點數流水帳，填寫異動類型、異動點數及原因。
2. 系統建立狀態為 `pending` 的異動申請，不直接修改學生點數。
3. 管理員查看原始申請、原始點數與異動原因。
4. 管理員只能核准或拒絕承辦人提出的內容，不可直接修改異動點數。
5. 若內容錯誤，管理員拒絕後，由承辦人重新提出申請。
6. 管理員核准時，系統建立對應的 `adjustment` 或 `reversal` 點數流水帳。

業務驗證規則（Service 層）：

- 承辦人只能查看自己提出的異動申請；管理員可以查看所有待審核及歷史異動申請。
- `adjustment` 的 `requested_points` 可以是正數或負數，但異動後的學生該筆來源點數不得小於 `0`。
- `reversal` 的 `requested_points` 必須等於原始點數尚未被沖銷的相反數。
- `requested_by_user_id` 必須為承辦人、`reviewed_by_user_id` 必須為管理員，依 `users.role` 驗證。
- 管理員核准異動申請、建立點數流水帳及更新 `created_transaction_id`，必須在同一個 PostgreSQL Transaction 中完成。

權限邊界：

| 使用者 | 權限 |
| --- | --- |
| 承辦人 | 建立異動申請、查看自己提出的異動申請 |
| 管理員 | 查看所有異動申請、核准或拒絕異動申請 |

## 學生點數流水帳 `student_point_transactions`

申請核准後每位參與者實際取得的點數，以及核准後的更正紀錄。資料表欄位、`point_category`／`transaction_type` 允許值、Constraint、複合外鍵與 partial unique index 請參考 [資料模型 - student_point_transactions](data-model.md#學生點數流水帳-student_point_transactions)。

業務寫入規則（Service 層）：

- 申請核准時，系統依每位參與者的 `approved_points` 建立一筆 `award` 點數異動。
- 申請狀態更新為 `approved`、寫入 `point_applications.closed_at` 與建立所有學生點數異動，必須在同一個 PostgreSQL Transaction 中完成。
- 建立 `award` 時，必須把 `application_participants` 的 `academic_year`、`grade`、`class_number` 寫入流水帳快照欄位。
- 核准前承辦人調整點數時，流水帳只寫入最終 `approved_points`，不需要額外建立差額紀錄。
- 核准後若需要更正點數，不可修改或刪除原始流水帳；承辦人必須提出 `student_point_change_requests`，由管理員核准後新增一筆 `adjustment` 或 `reversal`。
- `adjustment` 與 `reversal` 必須沿用目標原始 `award` 的姓名、學年度、年級與班級快照，避免更正紀錄被歸到學生最新班級。
- `adjustment` 與 `reversal` 的 `created_by_user_id` 必須是核准異動申請的管理員。
- `point_category` 必須對應該申請的 `application_type`。

### 點數查詢方式

學生每種類別的累積點數，使用學號依類別加總：

```sql
SELECT point_category, SUM(points) AS category_total
FROM student_point_transactions
WHERE student_number = $1
GROUP BY point_category;
```

學生的所有點數總和：

```sql
SELECT SUM(points) AS total_points
FROM student_point_transactions
WHERE student_number = $1;
```

### 核准前與核准後調整

核准前調整：

```text
申請點數：10
承辦人核准點數：8
流水帳只建立：award +8
```

核准後更正：

```text
原始核准紀錄：award +10
更正紀錄：adjustment -2
最終累積點數：8
```

這種不可直接修改的流水帳設計，可以完整保留學生點數的來源與後續異動歷史。

## 公開學生點數總表 `student_points_summary`

提供學生在不登入的情況下，依學年度、年級、班級查詢自己或其他學生在該歸屬下的各類累積點數與總點數。第一版使用 PostgreSQL View 即時計算，資料量增加後可改為 Materialized View。

View 欄位、結構與設計說明請參考 [資料模型 - student_points_summary](data-model.md#公開學生點數總表-student_points_summary)；完整可執行 SQL 請參考 [資料庫 Schema](database-schema.md#student_points_summary-view)。

查詢功能：

- 支援依學年度、年級、班級代碼篩選；未指定學年度時，預設查目前學年度。
- 支援使用學號與姓名搜尋。
- 支援依學年度、年級、班級代碼、學號及總點數排序。
- 必須使用分頁，不一次回傳全部學生資料。
- 公開結果只顯示點數摘要，不顯示申請附件、Email、電話、拒絕原因或審核紀錄。
- 畢業生或歷史資料必須用歷史學年度查詢，不用學生最新班級推斷。

年級班級語意：

- `student_points_summary` 代表「某學年度、某年級／班級下的點數摘要」，不是「學生最新班級下的所有歷史點數」。
- `grade = 1..4` 代表一年級至四年級，`grade = 5..6` 代表碩一至碩二；`class_number = 1..5` 代表甲班至戊班。
- 顯示「三年甲班」時由 API 或前端用 `grade` 與 `class_number` 對照表合成。
- 「點數歸屬班級」來自流水帳不可變快照；「學生最新班級」若日後需要，應另由 `student_lifetime_points_summary` 或其他學生狀態資料來源提供。
- 延後畢業學生歸類已討論，第一版暫不新增特殊狀態或額外年級值；目前以申請當下行政歸屬年級班級為準。

### 公開資料遮罩

由於查詢功能不要求登入，API 回傳公開總表時必須遮罩姓名與學號。

範例：

```text
姓名：王○明
學號：4A01***45
```

資料庫 View 可以保留完整姓名與學號供查詢使用，但 API Response 必須只回傳遮罩後的欄位，例如：

```text
masked_student_name
masked_student_number
academic_year
grade
class_number
competition_points
project_participation_points
certificate_points
external_exhibition_points
total_points
updated_at
```

即使使用完整學號或姓名搜尋，公開 API 仍不可回傳未遮罩的姓名與學號。

因為學年度、年級、班級、學號與姓名由申請人手動填寫，承辦人核准前必須確認資料一致性，避免同一學號在同一學年度出現不合理的姓名或班級差異。
