# API Request / Response Schema

本文件定義第一版 API 的共用 request / response 格式、分頁、錯誤碼、主要 endpoint payload 與欄位命名規則；標示「第二版預留」的段落不屬於第一版 routes 與驗收範圍。Zod 驗證責任與跨欄位規則請參考 [Zod 驗證規格](zod-validation.md)；API 分組、權限與 Service 邊界請參考 [API 與 Service 邊界](api-service-boundaries.md)；資料表欄位語意請參考 [資料模型](data-model.md)。

## 共用規則

欄位命名：

- API 使用 `camelCase`。
- 資料庫使用 `snake_case`。
- Controller 或 serializer 負責轉換命名。

資料型別：

- 時間點使用 ISO 8601 字串，例如 `2026-07-05T10:20:30.000+08:00`。
- 日期使用 `YYYY-MM-DD`。
- 點數使用字串，例如 `"10.00"`。
- 金額使用整數 number，單位為新台幣元。
- `publicId` 使用 UUID 字串。
- 後台管理資源若沒有 `public_id`，第一版可使用內部 `id` number。

安全規則：

- 除 `GET /auth/csrf-token` 外，API response 不回傳 `passwordHash`、任何 token、token hash、session token、CSRF token、`storageKey`、`signatureStorageKey`。
- 公開學生點數 API 只回傳遮罩後姓名與學號。
- 私有檔案 API 回傳 stream，不回傳 JSON 檔案內容。

## 共用 Response

成功建立資源：

```json
{
  "data": {
    "publicId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

一般成功：

```json
{
  "data": {
    "ok": true
  }
}
```

分頁列表：

```json
{
  "data": [
    {}
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 120,
    "totalPages": 6
  }
}
```

錯誤：

```json
{
  "code": "application_status_conflict",
  "message": "申請狀態已變更，請重新整理後再操作。"
}
```

Zod 驗證錯誤：

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

## 共用 Query

分頁：

| 欄位 | 型別 | 預設 | 規則 |
| --- | --- | --- | --- |
| `page` | number | `1` | 最小 `1` |
| `pageSize` | number | `20` | 最小 `1`，最大 `100` |

日期區間：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `createdFrom` | date-time | 起始時間，可省略 |
| `createdTo` | date-time | 結束時間，可省略 |

## 共用物件

### 使用者 `User`

```json
{
  "id": 1,
  "displayName": "王小明",
  "email": "admin@example.com",
  "role": "admin",
  "isActive": true,
  "activatedAt": "2026-07-05T10:20:30.000+08:00",
  "lastLoginAt": "2026-07-05T10:20:30.000+08:00",
  "createdAt": "2026-07-05T10:20:30.000+08:00",
  "updatedAt": "2026-07-05T10:20:30.000+08:00"
}
```

### 指導老師 `Advisor`

```json
{
  "id": 10,
  "userId": 20,
  "employeeNumber": "T001",
  "name": "陳老師",
  "titleCode": 6,
  "titleLabel": "專任教授",
  "department": "多媒體設計系",
  "isDirector": false,
  "isActive": true,
  "email": "teacher@example.com",
  "createdAt": "2026-07-05T10:20:30.000+08:00",
  "updatedAt": "2026-07-05T10:20:30.000+08:00"
}
```

### 申請列表項目 `ApplicationListItem`

```json
{
  "publicId": "550e8400-e29b-41d4-a716-446655440000",
  "applicationType": "competition",
  "status": "under_review",
  "applicantName": "王小明",
  "applicantEmail": "student@example.com",
  "advisorName": "陳老師",
  "requestedTotalPoints": "10.00",
  "approvedTotalPoints": null,
  "submittedAt": "2026-07-05T10:20:30.000+08:00",
  "advisorConfirmationExpiresAt": "2026-07-08T10:20:30.000+08:00",
  "updatedAt": "2026-07-05T10:20:30.000+08:00"
}
```

### 申請參與者 `ApplicationParticipant`

```json
{
  "id": 1,
  "academicYear": "114",
  "grade": 3,
  "classNumber": 1,
  "studentNumber": "4A0X0001",
  "studentName": "王小明",
  "requestedPoints": "10.00",
  "approvedPoints": null,
  "isApplicant": true
}
```

### 附件 Metadata `Attachment`

```json
{
  "publicId": "7d9a2f9a-67d7-4c81-8d0e-a65d07a7d901",
  "attachmentType": "finalist_or_award_certificate",
  "attachmentTypeOther": null,
  "description": "獎狀",
  "originalFilename": "award.pdf",
  "mimeType": "application/pdf",
  "fileSize": 102400,
  "createdAt": "2026-07-05T10:20:30.000+08:00"
}
```

## 公開 API

### `GET /public/advisors`

回傳目前可供申請人選擇的指導老師。只包含 `advisors.is_active = true`，且關聯帳號已啟用、未停用的資料。

```json
{
  "data": [
    {
      "id": 10,
      "name": "陳老師",
      "titleCode": 6,
      "department": "多媒體設計系",
      "isDirector": false
    }
  ]
}
```

### `GET /public/application-instructions`

Query：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `applicationType` | string | 必填，四種申請類型之一 |
| `includeHistorical` | boolean | 預設 `false`；是否包含已過期的公開說明 |

預設只回傳查詢當下 `isVisible = true` 且位於有效期間內的說明。`includeHistorical = true` 時，另外包含已過期但仍為公開狀態的說明，供歷年辦法頁查詢；尚未到 `effectiveFrom` 的未來內容仍不公開。結果依 `effectiveFrom` 倒序，再依 `displayOrder`、`id` 排序。

```json
{
  "data": [
    {
      "sectionKey": "eligibility",
      "title": "114年度競賽點數辦法",
      "content": "申請資格與應備資料說明。",
      "displayOrder": 10,
      "effectiveFrom": "2025-08-01",
      "effectiveTo": "2026-07-31"
    }
  ]
}
```

### `POST /public/applications`

Content type 使用 `multipart/form-data`。JSON 欄位建議放在 `payload`，檔案欄位使用 `attachments[]`。

`payload`：

```json
{
  "applicationType": "competition",
  "advisorId": 10,
  "applicant": {
    "name": "王小明",
    "email": "student@example.com",
    "phone": "0912345678"
  },
  "participants": [
    {
      "academicYear": "114",
      "grade": 3,
      "classNumber": 1,
      "studentNumber": "4A0X0001",
      "studentName": "王小明",
      "requestedPoints": "10.00",
      "isApplicant": true
    }
  ],
  "typeDetails": {
    "competitionLevel": "national_integrated",
    "competitionLevelOther": null,
    "award": "finalist",
    "awardOther": null,
    "competitionName": "全國競賽",
    "competitionCategory": "遊戲設計組",
    "competitionDate": "2026-07-05"
  },
  "attachments": [
    {
      "clientFileKey": "file-1",
      "attachmentType": "finalist_or_award_certificate",
      "attachmentTypeOther": null,
      "description": "獎狀"
    }
  ]
}
```

`attachments[].clientFileKey` 用來對應 multipart 檔案欄位，由前端產生，後端不保存。

`typeDetails` 依 `applicationType` 使用 discriminated union。

競賽：

```json
{
  "competitionLevel": "national_integrated",
  "competitionLevelOther": null,
  "award": "finalist",
  "awardOther": null,
  "competitionName": "全國競賽",
  "competitionCategory": "遊戲設計組",
  "competitionDate": "2026-07-05"
}
```

`competitionCategory` 對應資料庫欄位 `competition_category`，表示同一競賽中的比賽組別、類別或領域，例如「遊戲設計組」或「動畫類」。它不是點數規則使用的競賽等級；競賽等級由 `competitionLevel` 表示。第一版競賽申請不保存主辦單位。

參與計畫：

```json
{
  "projectName": "A 計畫",
  "principalInvestigator": "陳教授",
  "workDescription": "協助設計與開發",
  "salaryItems": [
    {
      "salaryMonth": "2026-07-01",
      "salaryAmount": 5000
    }
  ]
}
```

證照：

```json
{
  "certificateName": "Adobe Certified Professional",
  "certificateIssuer": "Adobe",
  "certificateNumber": "ACP-2026-0001",
  "certificateDate": "2026-07-05"
}
```

校外展覽：

```json
{
  "exhibitionType": "project_work",
  "workName": "作品名稱",
  "exhibitionName": "young_designers_exhibition",
  "exhibitionNameOther": null,
  "organizer": "主辦單位",
  "venue": "展覽場地",
  "startDate": "2026-07-01",
  "endDate": "2026-07-05"
}
```

Response `201`：

```json
{
  "data": {
    "publicId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending_advisor",
    "submittedAt": "2026-07-05T10:20:30.000+08:00"
  }
}
```

### `GET /public/applications/revisions/:token`

Response：

```json
{
  "data": {
    "application": {
      "publicId": "550e8400-e29b-41d4-a716-446655440000",
      "applicationType": "competition",
      "status": "needs_revision",
      "applicant": {
        "name": "王小明",
        "email": "student@example.com",
        "phone": "0912345678"
      },
      "participants": [],
      "typeDetails": {},
      "attachments": []
    },
    "editTokenExpiresAt": "2026-07-12T10:20:30.000+08:00",
    "revisionReason": "請補上獎狀。"
  }
}
```

### `POST /public/applications/revisions/:token`

Request 與 `POST /public/applications` 相同，但代表整份申請重新提交。Response：

```json
{
  "data": {
    "publicId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending_advisor",
    "versionNumber": 2,
    "submittedAt": "2026-07-05T10:20:30.000+08:00"
  }
}
```

### `GET /public/student-points`

Query：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `academicYear` | string | 未指定時預設目前學年度 |
| `grade` | number | `1..6` |
| `classNumber` | number | `1..5` |
| `keyword` | string | 學號或姓名搜尋 |
| `sortBy` | string | `studentNumber`、`totalPoints`、`grade`、`classNumber` |
| `sortOrder` | string | `asc`、`desc` |

Response：

```json
{
  "data": [
    {
      "academicYear": "114",
      "grade": 3,
      "classNumber": 1,
      "maskedStudentNumber": "4A01***45",
      "maskedStudentName": "王○明",
      "competitionPoints": "10.00",
      "projectParticipationPoints": "0.00",
      "certificatePoints": "2.00",
      "externalExhibitionPoints": "0.00",
      "totalPoints": "12.00",
      "updatedAt": "2026-07-05T10:20:30.000+08:00"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

## Auth API

### `POST /auth/login`

Request：

```json
{
  "email": "admin@example.com",
  "password": "password"
}
```

Response：

```json
{
  "data": {
    "user": {
      "id": 1,
      "displayName": "管理員",
      "email": "admin@example.com",
      "role": "admin"
    }
  }
}
```

登入成功時後端設定 HttpOnly session cookie。

### `POST /auth/logout`

Request body 為空。Response：

```json
{
  "data": {
    "ok": true
  }
}
```

### `GET /auth/me`

Response：

```json
{
  "data": {
    "user": {
      "id": 1,
      "displayName": "管理員",
      "email": "admin@example.com",
      "role": "admin",
      "permissions": [
        "users.list"
      ]
    }
  }
}
```

### `GET /auth/csrf-token`

Response：

```json
{
  "data": {
    "csrfToken": "base64url-random-token"
  }
}
```

此 endpoint 需要有效 session。回傳的 `csrfToken` 綁定目前 session，前端應在 state-changing API 使用 `X-CSRF-Token` header 帶回。

### `POST /auth/activation/:token`

Request：

```json
{
  "password": "new-password"
}
```

### `POST /auth/password-reset/request`

Request：

```json
{
  "email": "user@example.com"
}
```

Response 不揭露帳號是否存在：

```json
{
  "data": {
    "ok": true
  }
}
```

### `POST /auth/password-reset/:token`

Request：

```json
{
  "password": "new-password"
}
```

## 指導老師 API

### `GET /advisor/applications/pending`

Query 支援分頁。Response：

```json
{
  "data": [
    {
      "publicId": "550e8400-e29b-41d4-a716-446655440000",
      "applicationType": "competition",
      "applicantName": "王小明",
      "requestedTotalPoints": "10.00",
      "submittedAt": "2026-07-05T10:20:30.000+08:00",
      "advisorConfirmationExpiresAt": "2026-07-08T10:20:30.000+08:00"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

### `GET /advisor/applications/pending/:publicId`

Response：

```json
{
  "data": {
    "application": {
      "publicId": "550e8400-e29b-41d4-a716-446655440000",
      "applicationType": "competition",
      "status": "pending_advisor",
      "applicantName": "王小明",
      "applicantEmail": "student@example.com",
      "applicantPhone": "0912345678",
      "participants": [],
      "typeDetails": {},
      "attachments": [],
      "currentVersion": {
        "id": 1,
        "versionNumber": 1,
        "createdAt": "2026-07-05T10:20:30.000+08:00"
      }
    }
  }
}
```

### `POST /advisor/applications/pending/:publicId/approve`

Content type 使用 `multipart/form-data`，簽名檔案欄位為 `signature`。

Request `payload`：

```json
{
  "confirmVersionNumber": 1
}
```

Response：

```json
{
  "data": {
    "status": "under_review",
    "signedAt": "2026-07-05T10:20:30.000+08:00"
  }
}
```

### `POST /advisor/applications/pending/:publicId/reject`

Request：

```json
{
  "reason": "申請內容與實際指導不符。"
}
```

Response：

```json
{
  "data": {
    "status": "rejected",
    "closedAt": "2026-07-05T10:20:30.000+08:00"
  }
}
```

歷史列表與詳情使用同一套 list item 與 detail schema，但查詢範圍包含已處理申請。

## 承辦人 API

### `GET /reviewer/applications/review`

Query：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `applicationType` | string | 可省略 |
| `keyword` | string | 申請人、學號或申請 public id |
| `submittedFrom` | date-time | 可省略 |
| `submittedTo` | date-time | 可省略 |

Response 使用 `ApplicationListItem[]`。

### `POST /reviewer/applications/review/:publicId/request-revision`

Request：

```json
{
  "reason": "請補上證明文件。",
  "editTokenExpiresAt": "2026-07-12T10:20:30.000+08:00"
}
```

Response：

```json
{
  "data": {
    "status": "needs_revision",
    "editTokenExpiresAt": "2026-07-12T10:20:30.000+08:00"
  }
}
```

### `POST /reviewer/applications/review/:publicId/extend-revision`

僅可延長 `needs_revision` 狀態且補件 Token 仍有效的申請。新的 `editTokenExpiresAt` 必須晚於目前時間與原補件期限；延長時不重新產生補件 Token。

Request：

```json
{
  "reason": "申請人要求延長補件期限。",
  "editTokenExpiresAt": "2026-07-15T10:20:30.000+08:00"
}
```

Response：

```json
{
  "data": {
    "status": "needs_revision",
    "editTokenExpiresAt": "2026-07-15T10:20:30.000+08:00"
  }
}
```

### `POST /reviewer/applications/review/:publicId/adjust-before-approval`

Request：

```json
{
  "reason": "依規則調整競賽等級與點數。",
  "approvedTypeDetails": {
    "competitionLevel": "national_non_integrated",
    "competitionLevelOther": null,
    "award": "finalist",
    "awardOther": null
  },
  "participants": [
    {
      "participantId": 1,
      "approvedPoints": "1.50"
    }
  ],
  "approvedTotalPoints": "1.50"
}
```

### `POST /reviewer/applications/review/:publicId/approve`

Request：

```json
{
  "reason": null,
  "confirmVersionNumber": 1
}
```

若核准時同時包含調整，`reason` 必填，調整內容應先透過 `adjust-before-approval` 或同一 request 中的 approved 欄位傳入。

Response：

```json
{
  "data": {
    "status": "approved",
    "approvedTotalPoints": "10.00",
    "closedAt": "2026-07-05T10:20:30.000+08:00"
  }
}
```

### `POST /reviewer/applications/review/:publicId/reject`

Request：

```json
{
  "reason": "申請內容不符合點數規則。"
}
```

## 管理員 API

### Users

`GET /admin/users` query：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `role` | string | `advisor`、`reviewer`、`admin` |
| `isActive` | boolean | 可省略 |
| `keyword` | string | 姓名或 Email |

`POST /admin/users` request：

```json
{
  "displayName": "承辦人",
  "email": "reviewer@example.com",
  "role": "reviewer"
}
```

`PATCH /admin/users/:userId` request：

```json
{
  "displayName": "新名稱",
  "email": "new@example.com"
}
```

啟用、停用、重寄啟用信、寄送密碼重設信 request body 第一版可為空；停用若需要原因，可使用：

```json
{
  "reason": "帳號停用。"
}
```

`POST /admin/users/:userId/transfer-admin` request：

```json
{
  "reason": "管理員職務移交。"
}
```

`:userId` 必須是 `role = "admin"`、已完成密碼設定且尚未啟用的新管理員帳號。移交成功後，舊管理員停用、新管理員啟用，並撤銷舊管理員既有 session。

### Advisors

`POST /admin/advisors` request：

```json
{
  "user": {
    "displayName": "陳老師",
    "email": "teacher@example.com"
  },
  "advisor": {
    "employeeNumber": "T001",
    "name": "陳老師",
    "titleCode": 6,
    "department": "多媒體設計系",
    "isDirector": false
  }
}
```

`PATCH /admin/advisors/:advisorId` request：

```json
{
  "employeeNumber": "T001",
  "name": "陳老師",
  "titleCode": 7,
  "department": "多媒體設計系"
}
```

`POST /admin/advisors/:advisorId/assign-director` request：

```json
{
  "reason": "主任異動。"
}
```

### Email Tasks（第二版預留）

第一版會建立及投遞 Email tasks，但不提供以下管理端查詢與手動重寄 API。

`GET /admin/email-tasks` query：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `status` | string | 通常查詢 `failed` |
| `template` | string | 可省略 |
| `createdFrom` | string | ISO 8601，可省略 |
| `createdTo` | string | ISO 8601，可省略 |
| `page` | number | 預設 `1` |
| `pageSize` | number | 預設 `20`，最大 `100` |

`GET /admin/email-tasks/:emailTaskId` response：

```json
{
  "data": {
    "id": 500,
    "status": "failed",
    "template": "advisor_signature_request",
    "recipientEmail": "teacher@example.edu",
    "attemptCount": 5,
    "maxAttempts": 5,
    "lastError": "provider permanent bounce",
    "scheduledAt": "2026-07-05T10:20:30.000+08:00",
    "sentAt": null,
    "createdAt": "2026-07-05T10:20:30.000+08:00"
  }
}
```

`POST /admin/email-tasks/:emailTaskId/retry` request：

```json
{
  "reason": "確認收件人信箱後手動重寄。"
}
```

Response：

```json
{
  "data": {
    "newEmailTaskId": 801,
    "retryOfEmailTaskId": 500,
    "status": "pending"
  }
}
```

只能 retry `failed` task。重寄不修改原本 failed task，而是建立新的 `email_tasks`，並在新 task 的 `templatePayload` 或 metadata 中記錄 `retryOfEmailTaskId`。

### Point Rules

`GET /admin/point-rules` query：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `applicationType` | string | `competition`、`project_participation`、`certificate`、`external_exhibition` |
| `includeExpired` | boolean | 預設 `false` |

`POST /admin/point-rules` request 使用 `applicationType` discriminated union。後端依申請類型操作對應的點數規則表。

競賽規則：

```json
{
  "applicationType": "competition",
  "competitionLevel": "national_integrated",
  "award": "finalist",
  "allocationMethod": "per_person",
  "points": "3.00",
  "effectiveFrom": "2026-08-01",
  "effectiveTo": null
}
```

參與計畫規則：

```json
{
  "applicationType": "project_participation",
  "salaryUnit": 1000,
  "pointsPerUnit": "0.50",
  "roundingMethod": "floor",
  "maximumPoints": null,
  "effectiveFrom": "2026-08-01",
  "effectiveTo": null
}
```

證照規則：

```json
{
  "applicationType": "certificate",
  "pointsPerCertificate": "2.00",
  "maximumPointsPerStudent": "4.00",
  "effectiveFrom": "2026-08-01",
  "effectiveTo": null
}
```

展覽規則：

```json
{
  "applicationType": "external_exhibition",
  "exhibitionType": "project_work",
  "minimumPointsPerPerson": "1.00",
  "maximumPointsPerPerson": "2.00",
  "effectiveFrom": "2026-08-01",
  "effectiveTo": null
}
```

`POST /admin/point-rules/:applicationType/:ruleId/deactivate` request：

```json
{
  "effectiveTo": "2026-08-01",
  "reason": "規則版本切換。"
}
```

已生效或已被申請引用的點數規則不可原地修改。建立新版本後，再以明確的 `applicationType` 與 `ruleId` 設定舊版本失效日期。

### Participant Rules

`GET /admin/application-participant-rules` query：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `applicationType` | string | 可省略；指定時只查一種申請 |
| `includeExpired` | boolean | 預設 `false` |

`POST /admin/application-participant-rules` request：

```json
{
  "applicationType": "competition",
  "minimumParticipants": 1,
  "maximumParticipants": 10,
  "effectiveFrom": "2026-08-01",
  "effectiveTo": null
}
```

`minimumParticipants` 與 `maximumParticipants` 都必須是正整數，且最小值不得大於最大值。同一申請類型的有效期間不得重疊。

`POST /admin/application-participant-rules/:ruleId/deactivate` 使用與點數規則相同的 `effectiveTo`、`reason` request 格式。既有申請保留送件時套用的規則結果，新規則只影響有效日起的新送件。

### Application Instructions

`GET /admin/application-instructions` 可使用 `applicationType`、`isVisible`、`includeExpired` 與共用分頁 query。

`POST /admin/application-instructions` request：

```json
{
  "applicationType": "competition",
  "sectionKey": "eligibility",
  "title": "114年度競賽點數辦法",
  "content": "申請資格與應備資料說明。",
  "displayOrder": 10,
  "isVisible": false,
  "effectiveFrom": "2025-08-01",
  "effectiveTo": "2026-07-31"
}
```

`PATCH /admin/application-instructions/:instructionId` 接收上述可修改欄位的部分集合，但 body 至少要有一個欄位。尚未生效的說明可修改內容與有效期間；已生效的說明不原地改寫 `applicationType`、`sectionKey`、`title`、`content` 或有效期間，需建立新資料保留歷史。`displayOrder` 可獨立調整。

`POST /admin/application-instructions/:instructionId/show` 與 `/hide` body 可為空。顯示操作只改變 `isVisible`，公開 API 仍會檢查有效期間。

### Audit Logs（第二版預留）

第一版會持續寫入必要的 `audit_logs`，但不提供以下管理端查詢 API。

`GET /admin/audit-logs` query：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `actorUserId` | number | 可省略 |
| `actorType` | string | `user`、`system`、`maintenance` |
| `action` | string | 可省略 |
| `resourceType` | string | 可省略 |
| `resourceId` | number | 可省略 |
| `createdFrom` | date-time | 可省略 |
| `createdTo` | date-time | 可省略 |

Response：

```json
{
  "data": [
    {
      "id": 1,
      "actorType": "user",
      "actorUser": {
        "id": 1,
        "displayName": "管理員",
        "email": "admin@example.com"
      },
      "action": "advisor_signature.viewed",
      "resourceType": "advisor_signature",
      "resourceId": 10,
      "resourcePublicId": null,
      "metadata": {
        "applicationPublicId": "550e8400-e29b-41d4-a716-446655440000"
      },
      "ipAddress": "203.0.113.1",
      "userAgent": "Mozilla/5.0",
      "createdAt": "2026-07-05T10:20:30.000+08:00"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

## 第二版點數異動 API（預留）

以下 API 不屬於第一版 routes 與驗收範圍。

`POST /reviewer/point-change-requests` request：

```json
{
  "targetTransactionId": 100,
  "changeType": "adjustment",
  "requestedPoints": "-2.00",
  "reason": "核准後發現點數應調整。"
}
```

`POST /admin/point-change-requests/:publicId/approve` request：

```json
{
  "reviewComment": "同意調整。"
}
```

`POST /admin/point-change-requests/:publicId/reject` request：

```json
{
  "reviewComment": "資料不足。"
}
```

## 私有檔案 API

附件與簽名 API 成功時回傳檔案 stream，不回傳 JSON。

Response header 依 [私有檔案儲存設計](file-storage.md#私有檔案讀取)：

```text
Content-Type: application/pdf
Content-Length: 102400
Content-Disposition: inline; filename="award.pdf"
X-Content-Type-Options: nosniff
Cache-Control: no-store
```

錯誤時使用共用錯誤格式。

## 第一版錯誤碼

| `code` | HTTP | 說明 |
| --- | ---: | --- |
| `validation_failed` | 422 | Request schema 驗證失敗 |
| `unauthenticated` | 401 | 尚未登入或 session 無效 |
| `forbidden` | 403 | 缺少權限或不符合資料範圍 |
| `csrf_token_invalid` | 403 | CSRF token 缺漏、格式錯誤或驗證失敗 |
| `not_found` | 404 | 資源不存在或不揭露存在 |
| `rate_limited` | 429 | 超過 rate limit |
| `application_status_conflict` | 409 | 申請狀態已改變 |
| `application_version_conflict` | 409 | 使用者確認的版本不是目前版本 |
| `advisor_confirmation_expired` | 409 | 指導老師簽核已逾期 |
| `revision_token_invalid` | 409 | 補件 token 無效、過期或已使用 |
| `point_change_request_status_conflict` | 409 | 點數異動申請已被處理 |
| `point_rule_period_overlap` | 409 | 點數規則有效期間重疊 |
| `certificate_points_limit_exceeded` | 400 | 證照點數超過累積上限 |
| `file_type_not_allowed` | 400 | 檔案格式不允許 |
| `file_too_large` | 400 | 檔案超過大小限制 |
| `too_many_files` | 400 | 附件數量超過上限 |
| `file_missing` | 404 | 檔案 metadata 存在但實體檔案遺失 |
| `email_already_exists` | 409 | Email 已被使用 |
| `active_admin_required` | 409 | 管理員移交或停用會造成無啟用管理員 |
| `active_director_conflict` | 409 | 主任設定發生衝突 |
| `internal_error` | 500 | 未預期錯誤 |

## 尚待實作時確認

- 最終 OpenAPI 產出格式。
- 前端是否需要更細的欄位級錯誤代碼。
- 各列表的最終排序欄位白名單。
- 檔案 multipart 欄位命名是否依前端表單實作調整。
