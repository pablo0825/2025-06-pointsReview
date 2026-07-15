# Zod 驗證規格

本文件定義第一版 API request 進入 Service 前的 Zod 驗證責任、schema 分層、各申請類型的 request 結構與跨欄位驗證原則。API 欄位格式請參考 [API Request / Response Schema](api-schemas.md)，Service 與 Repository 邊界請參考 [API 與 Service 邊界](api-service-boundaries.md)，資料庫最終限制請參考 [Schema 設計規範](schema-conventions.md)。

## 定位

Zod 是 API 邊界的格式與基本規則驗證，不是正式業務規則的唯一來源。

Zod 負責在進入 Service 與 PostgreSQL Transaction 前，拒絕明顯不合法或結構錯誤的 request：

- 欄位型別、必填欄位、字串長度、enum 值。
- 日期、Email、UUID、金額、點數等格式。
- 單次 request 內可判斷的跨欄位關係。
- 陣列長度的技術上限，避免 request 過大。
- 同一個 request 內的重複資料，例如薪資月份不可重複。

Zod 不負責需要查資料庫才能確認的規則。這類規則必須由 Service 在 Transaction 內重新查詢並驗證：

- 申請類型當下有效的人數規則。
- 點數規則、累積上限與有效日期。
- 指導老師是否存在、啟用且可被選擇。
- 申請目前狀態是否允許補件、簽核、審核或點數異動。
- 附件數量累計、參與者點數加總與資料所有權。

## 驗證分層

```text
Frontend basic validation
  → Zod request validation
  → File validation
  → Service business validation
  → PostgreSQL Transaction、Constraint、Index
```

| 層級 | 責任 |
| --- | --- |
| Frontend | 即時提示必填、格式、基本人數、月份重複、金額與附件選擇錯誤 |
| Zod | 驗證 request body / query / params 的資料形狀、型別、enum、基本長度與跨欄位關係 |
| File validation | 驗證副檔名、宣告 MIME type、實際檔案內容、檔案大小與圖片尺寸 |
| Service | 查詢規則版本、驗證流程狀態、資料所有權、點數計算、累計上限與併發下的一致性 |
| PostgreSQL | 以 `NOT NULL`、FK、`CHECK`、`UNIQUE`、exclusion constraint 與 Transaction 保證最終資料完整性 |

## Schema 分層

共用 schema 應保持小而穩定，主要共用格式，不共用流程語意。不要建立過大的 `commonApplicationSchema`、萬用 `participantSchema` 或跨所有 endpoint 共用的申請 payload。各 endpoint 應在自己的 request schema 中組合需要的 primitive 與 fragment，並保留自己的業務語意。

### Primitive Schema

Primitive schema 只處理穩定格式，不帶特定申請流程語意：

| Schema | 驗證內容 |
| --- | --- |
| `publicIdSchema` | UUID 字串 |
| `idSchema` | 後台管理資源使用的正整數 id |
| `dateSchema` | `YYYY-MM-DD` 日期字串 |
| `dateTimeSchema` | ISO 8601 date-time 字串 |
| `monthDateSchema` | `YYYY-MM-DD`，且日期必須為該月 1 日 |
| `emailSchema` | 合法 Email，長度不超過資料庫欄位上限 |
| `trimmedNonEmptyStringSchema` | 去除前後空白後不可為空的字串 |
| `decimalPointSchema` | 非負 decimal 字串或 number，進入 Service 後統一轉成 decimal |
| `moneyAmountSchema` | 正整數，單位為新台幣元 |

### 可重用 Fragment

Fragment 可以共用，但必須維持單一語意，不應偷偷包含某個流程才需要的欄位：

| Fragment | 驗證內容 |
| --- | --- |
| `applicantContactSchema` | 申請人姓名、Email、電話等聯絡資料 |
| `studentIdentitySchema` | 學號、姓名、學年度、年級、班級等學生身分欄位 |
| `attachmentMetadataSchema` | 附件類型、檔名、檔案大小、宣告 MIME type |
| `salaryItemSchema` | 單一薪資月份與金額 |

例如 `studentIdentitySchema` 不應包含 `requestedPoints` 或 `isApplicant`，因為那是「申請參與者」才有的語意；`salaryItemSchema` 只表示單筆月份薪資，不負責整份參與計畫申請是否有效。

### Endpoint 專屬 Schema

下列 schema 應維持 endpoint 專屬，不要抽成過大的共用 schema：

| Schema | 原因 |
| --- | --- |
| `createCompetitionApplicationSchema` | 競賽等級、獎項與競賽日期只屬於競賽申請 |
| `createCertificateApplicationSchema` | 證照名稱、證照編號與發照日期只屬於證照申請 |
| `createProjectParticipationApplicationSchema` | 薪資明細與計畫資料只屬於參與計畫申請 |
| `createExternalExhibitionApplicationSchema` | 展覽類型、作品名稱與展覽日期只屬於校外展覽申請 |
| `reviewApplicationSchema` | 承辦人審核 action、reason 與 adjustment metadata 是審核流程語意 |
| `createPointChangeRequestSchema` | 點數異動類型、目標交易與 requested points 是點數異動流程語意 |

`applicationType` enum 可以抽成常數或 helper，但各 endpoint 仍應各自決定允許哪些類型、錯誤訊息與權限限制。

API request 使用 `camelCase`；Controller 或 mapper 負責轉換成資料庫需要的 `snake_case`。

## 建立申請 Schema

目前建立申請採用共用 endpoint：

```text
POST /public/applications
```

Endpoint 是 API 入口，負責接收 request、呼叫 Zod 驗證，並把通過驗證的資料交給 Service。這支 endpoint 不代表所有申請都使用同一套完整 schema，而是先讀取 `applicationType`，再由 Zod 選擇對應的申請 schema。

流程：

```text
POST /public/applications
  → 讀取 applicationType
  → Zod 依 applicationType 選擇對應 schema
  → schema 驗證 request 格式與單次 request 可判斷的欄位關係
  → Service 查詢規則、計算點數、驗證狀態與寫入資料庫
```

建立申請使用 `applicationType` 作為 discriminator，不同申請類型只能帶入對應的 detail payload。

```ts
const createApplicationSchema = z.discriminatedUnion("applicationType", [
  competitionApplicationCreateSchema,
  certificateApplicationCreateSchema,
  projectParticipationApplicationCreateSchema,
  externalExhibitionApplicationCreateSchema,
]);
```

例如：

| `applicationType` | 使用的 Schema | 驗證重點 |
| --- | --- | --- |
| `competition` | `competitionApplicationCreateSchema` | 競賽名稱、競賽等級、獎項、競賽日期 |
| `certificate` | `certificateApplicationCreateSchema` | 證照名稱、證照編號、發照單位、證照日期 |
| `project_participation` | `projectParticipationApplicationCreateSchema` | 計畫名稱、主持人、工作內容、逐月薪資 |
| `external_exhibition` | `externalExhibitionApplicationCreateSchema` | 展覽類型、作品名稱、展覽名稱、展覽日期 |

這個設計的重點是：**endpoint 可以共用，但 schema 與類型專屬處理不能混成一個大型共用 schema**。Controller 應只負責驗證與轉交，Service 內部再依 `applicationType` 呼叫對應的類型處理器建立 detail 資料。

```text
ApplicationSubmissionService.submitApplication(payload)
  → 建立 point_applications
  → 建立 application_participants
  → 依 applicationType 呼叫類型專屬 handler
  → 建立 application_attachments
  → 建立 application_versions
  → 建立 advisor email tasks
```

與「一種申請一支 endpoint」相比：

| 設計 | 優點 | 風險 |
| --- | --- | --- |
| 共用 `POST /public/applications`，依 `applicationType` 分流 | 送件流程統一、API surface 較小、符合 `point_applications` 共用主表設計 | Controller / Service 若沒有拆 handler，容易變成過大的函式 |
| 一種申請一支 endpoint，例如 `/applications/competition` | 每支 API 很直覺，schema 一對一 | 建立主申請、參與者、附件、版本與通知流程容易重複 |

第一版採用共用 endpoint，因為四種申請都共享主申請、參與者、附件、版本與老師簽核通知流程；若未來某種申請的流程差異大到無法共用，再評估拆成獨立 endpoint。

所有申請類型共用欄位：

| 欄位 | Zod 驗證 |
| --- | --- |
| `applicationType` | 必須是合法申請類型 |
| `applicant.name` | 必填，去除前後空白後不可為空 |
| `applicant.email` | 必填，合法 Email |
| `applicant.phone` | 必填或可選依實作時表單定義；若填寫需符合電話格式與長度限制 |
| `advisorId` | 必填正整數；是否存在由 Service 驗證 |
| `participants` | 至少 1 人，技術上限例如 50 人；正式上下限由 Service 查 `application_type_participant_rules` |
| `typeDetails` | 依 `applicationType` 使用不同 schema |
| `attachments` | metadata 陣列；實際檔案由 file validation 驗證 |

共用跨欄位規則：

- `participants` 必須剛好有一位 `isApplicant = true`。
- `isApplicant = true` 的 `studentName` 應與 `applicant.name` 一致；Service 在寫入前仍需重新確認。
- 同一個 request 內 `participants[].studentNumber` 不可重複。
- `requestedTotalPoints` 若由前端送入，只能作為顯示輔助，後端不得信任；Service 必須重新計算。
- `participants` 的 `.max()` 只作為技術上限，不可取代資料庫可維護的人數規則。

## 競賽申請

`competitionApplicationCreateSchema` 驗證：

| 欄位 | Zod 驗證 |
| --- | --- |
| `competitionName` | 必填，去除前後空白後不可為空 |
| `competitionCategory` | 必填，去除前後空白後不可為空；表示比賽組別、類別或領域 |
| `competitionLevel` | 必須是系統允許的競賽等級 enum |
| `competitionLevelOther` | 當 `competitionLevel = "other"` 時必填；否則必須為 `null` 或不傳 |
| `award` | 必須是系統允許的獎項 enum |
| `awardOther` | 當 `award = "other_award"` 時必填；否則必須為 `null` 或不傳 |
| `competitionDate` | `YYYY-MM-DD` |

Service 仍需依競賽等級、名次與日期查詢有效的 `competition_point_rules`，並寫入實際使用的 rule id。`competitionCategory` 只保存比賽組別或類別資訊，不參與點數規則查詢；第一版競賽申請不接收或保存主辦單位欄位。

## 證照申請

`certificateApplicationCreateSchema` 驗證：

| 欄位 | Zod 驗證 |
| --- | --- |
| `certificateName` | 必填，去除前後空白後不可為空 |
| `certificateIssuer` | 必填，去除前後空白後不可為空 |
| `certificateNumber` | 必填，去除前後空白後不可為空 |
| `certificateDate` | `YYYY-MM-DD` |
| `participants` | 至少 1 人；正式規則第一版為 1 人，由 Service 查規則表驗證 |

Service 仍需查詢 `certificate_point_rules`，並在核准時檢查每位學生證照類累積點數上限。

## 參與計畫申請

`projectParticipationApplicationCreateSchema` 驗證：

| 欄位 | Zod 驗證 |
| --- | --- |
| `projectName` | 必填，去除前後空白後不可為空 |
| `principalInvestigator` | 必填，去除前後空白後不可為空 |
| `workDescription` | 必填，去除前後空白後不可為空 |
| `salaryItems` | 至少 1 筆月份金額 |
| `salaryItems[].salaryMonth` | `monthDateSchema`，必須是月份第一天 |
| `salaryItems[].salaryAmount` | 正整數 |

`salaryItems` 跨欄位規則：

- 同一個 request 內 `salaryMonth` 不可重複。
- 若送出多筆薪資，每筆代表一個月份與該月份金額。

## 校外展覽申請

`externalExhibitionApplicationCreateSchema` 驗證：

| 欄位 | Zod 驗證 |
| --- | --- |
| `exhibitionName` | 必填，去除前後空白後不可為空 |
| `exhibitionNameOther` | 當 `exhibitionName = "other"` 時必填；否則必須為 `null` 或不傳 |
| `exhibitionType` | `fan_work` 或 `project_work`，依資料庫 enum 命名為準 |
| `workName` | 必填，去除前後空白後不可為空 |
| `organizer` | 必填，去除前後空白後不可為空 |
| `venue` | 必填，去除前後空白後不可為空 |
| `startDate` | `YYYY-MM-DD` |
| `endDate` | `YYYY-MM-DD`，不可早於 `startDate` |
| `participants` | 至少 1 人；正式上限由 Service 查規則表驗證 |

Service 仍需依展覽類型與日期查詢有效的 `exhibition_point_rules`，並計算每位參與者點數。

## 補件 Schema

補件 request 應沿用建立申請的 discriminated union，但需注意：

- URL token 格式由 params schema 驗證。
- Zod 只驗證補件 payload 格式；token 是否存在、是否逾期、申請是否仍為 `needs_revision` 由 Service 驗證。
- 補件不得讓使用者改變應沿用的規則版本；原申請的人數規則、點數規則沿用邏輯由 Service 控制。
- 新附件 metadata 與保留既有附件的選擇需要在 request schema 中明確表達，避免用隱含刪除語意。

## 後台操作 Schema

後台審核與規則管理也應使用 Zod 驗證 request 格式：

| 操作 | Zod 驗證重點 | Service 驗證重點 |
| --- | --- | --- |
| 承辦人核准 | action、approved points、adjustment metadata 格式 | 狀態、權限、點數規則、調整 reason 是否必填 |
| 退件 / 要求補件 | reason 必填且不可空白 | 狀態是否允許、是否建立補件 token 與通知 |
| 指導老師簽核 | 簽核 action、簽名 metadata | 老師身分、期限、申請狀態、簽名檔實際格式 |
| 點數規則管理 | `applicationType`、類型專屬欄位、點數範圍、有效日期區間 | 有效期間不可重疊、是否影響未來申請 |
| 人數規則管理 | 申請類型、正整數上下限、有效日期區間 | 同類規則期間不可重疊、歷史規則不可覆寫 |
| 申請說明管理 | section key、標題、內容、排序、顯示狀態、有效日期區間 | 已生效內容不可原地改寫、顯示狀態與有效期間 |
| 點數異動申請（第二版） | change type、target transaction id、requested points | 目標交易是否可異動、pending 衝突、異動後點數不可小於 0 |

### 點數規則 Schema

`POST /admin/point-rules` 使用 `applicationType` discriminated union，四種分支分別驗證競賽、參與計畫、證照與校外展覽規則。共用有效期間欄位可以抽成小型 object schema，但不建立包含所有類型欄位的大型 optional schema。

```ts
const createPointRuleSchema = z.discriminatedUnion("applicationType", [
  competitionPointRuleCreateSchema,
  projectParticipationPointRuleCreateSchema,
  certificatePointRuleCreateSchema,
  externalExhibitionPointRuleCreateSchema,
]);
```

Zod 負責欄位格式、enum、正數點數與 `effectiveFrom < effectiveTo`；Service 依 `applicationType` 選擇 Repository，檢查資料庫既有規則是否重疊。停用 endpoint 的 params 必須同時驗證 `applicationType` 與正整數 `ruleId`，避免只有 id 時無法確定目標資料表。

### 人數規則 Schema

`applicationParticipantRuleCreateSchema` 驗證：

- `applicationType` 是四種申請類型之一。
- `minimumParticipants`、`maximumParticipants` 為正整數。
- `minimumParticipants <= maximumParticipants`。
- `effectiveFrom`、`effectiveTo` 使用 date schema，且有效期間順序正確。

有效期間重疊與歷史版本保護需要查詢資料庫，屬於 `ParticipantRuleAdminService`，不放在 Zod。

### 申請說明 Schema

`applicationInstructionCreateSchema` 驗證 `applicationType`、非空白 `sectionKey`、`title`、`content`、非負整數 `displayOrder`、boolean `isVisible` 與有效期間。`applicationInstructionUpdateSchema` 使用 `.partial()` 後再限制至少有一個欄位，不能接受空物件。

公開查詢的 `publicApplicationInstructionQuerySchema` 只接收必要的 `applicationType`；公開端不接受 `isVisible` 或任意日期參數，避免讀取未公開或尚未生效內容。管理端 list query 才可接收 `isVisible`、`includeExpired` 與分頁欄位。

「是否已生效而可修改哪些欄位」需要讀取既有資料，屬於 `ApplicationInstructionAdminService`。Zod 只確認 request 本身格式。

## 錯誤格式

Zod 驗證失敗一律回傳 `422 validation_failed`，並包含欄位路徑：

```json
{
  "code": "validation_failed",
  "message": "輸入資料格式不正確。",
  "fields": [
    {
      "path": "participants.0.studentNumber",
      "message": "學號為必填欄位。"
    }
  ]
}
```

需要查資料庫後才能判斷的錯誤，不應包成 Zod error，而應回傳穩定業務錯誤碼，例如：

| 錯誤碼 | HTTP status | 使用情境 |
| --- | --- | --- |
| `participant_count_out_of_range` | `400` | 人數不符合當下有效規則 |
| `point_rule_not_found` | `400` | 找不到符合申請條件的點數規則 |
| `application_status_conflict` | `409` | 申請狀態已變更，不允許目前操作 |
| `duplicate_salary_month` | `422` 或 `400` | 若在 Zod 發現為 `422`；若資料庫衝突才發現為 `400` 或 `409` |
| `certificate_point_limit_exceeded` | `400` | 證照核准後會超過學生累積上限 |

## 實作注意事項

- Zod schema 應與 API request 欄位一致，使用 `camelCase`。
- 進入 Repository 前才轉為資料庫欄位命名與型別。
- 對使用者輸入字串先 `trim()`，但需避免把空白轉成合法空字串。
- 日期 request 使用字串，不直接要求前端送 JavaScript `Date`。
- 點數與金額不要用前端計算結果作為可信資料；Service 必須重新計算或重新查規則。
- 陣列 `.max()` 是保護系統的技術上限，正式可調整的人數限制應以 `application_type_participant_rules` 為準。
