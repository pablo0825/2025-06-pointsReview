# 帳號與權限

本文件描述帳號生命週期、角色權限代碼、資料所有權與權限矩陣。相關使用者及指導老師資料表請參考 [資料模型](data-model.md)。

## 帳號生命週期

使用者帳號欄位、角色值與資料限制請參考 [資料模型中的 `users`](data-model.md#使用者帳號-users)。

### 帳號建立與啟用

1. 管理員建立使用者帳號並指定單一角色。
2. 系統產生限時帳號啟用 Token，資料庫只保存 Token 雜湊值。
3. 系統寄送啟用連結至使用者 Email。
4. 使用者透過連結自行設定密碼。
5. 一般帳號完成密碼設定後，立即清除啟用 Token，並將帳號設為啟用。
6. 啟用連結過期後，只能由管理員重新寄送。

建議帳號啟用連結有效期限為 `24` 小時。管理員不能查看或設定使用者密碼。

### 帳號停用與交接

- 帳號不可刪除，只能將 `is_active` 設為 `false`，保留歷史操作紀錄。
- 承辦人帳號只能由管理員建立、啟用或停用。
- 承辦人交接期間允許同時存在多位啟用中的承辦人。
- 管理員不應交接同一組帳號密碼，必須使用管理員移交流程。
- 管理員移交時，先讓新管理員透過 Email 完成密碼設定，但帳號維持未啟用；再於同一個 PostgreSQL Transaction 中停用舊管理員並啟用新管理員。

### 管理員帳號復原

唯一管理員無法登入時，不提供公開管理員復原 API。應使用只能在伺服器執行的維運指令：

```text
npm run admin:recover -- admin@example.com
```

維運指令應驗證目標帳號是唯一管理員、撤銷現有登入 Token、產生限時密碼重設連結、寄送至管理員 Email，並保存帳號復原稽核紀錄。

## 角色與權限

第一版使用單一角色搭配程式內定義的權限清單，不建立完整 RBAC 資料表。

```text
users.role = advisor | reviewer | admin
```

後端授權時必須同時檢查：

1. 使用者帳號已啟用。
2. 使用者角色包含執行操作所需的權限。
3. 使用者是否符合該資料的存取範圍，例如指導老師只能存取自己的申請。
4. 申請目前狀態是否允許執行該操作。

## 權限實作策略

第一版不建立 `roles`、`permissions`、`user_roles` 或 `role_permissions` 等權限資料表。系統角色固定為 `advisor`、`reviewer` 與 `admin`，權限不需要由管理員動態配置，因此由後端程式統一定義角色與權限映射。

這種方式的優點：

- 權限規則集中在程式碼中，容易閱讀、測試及 Code Review。
- 權限變更必須經過程式修改與部署，不會因資料庫設定錯誤意外開放敏感操作。
- 避免為三種固定角色建立過度複雜的 RBAC 資料表與管理介面。

當系統未來需要讓管理員自訂角色、為單一帳號增加特殊權限，或不同單位需要不同權限組合時，再評估改為完整 RBAC 資料模型。

### 角色與權限映射

後端使用明確的型別與權限集合。下方 `Permission` 型別與 `rolePermissions` 對應本文件後續〈指導老師〉、〈承辦人〉與〈管理員〉三節列出的完整權限矩陣，實作時必須一致維護：

```ts
type Role = "advisor" | "reviewer" | "admin";

type Permission =
  // 指導老師專屬權限
  | "advisor_applications.pending.list"
  | "advisor_applications.pending.read"
  | "advisor_applications.history.list"
  | "advisor_applications.history.read"
  | "advisor_applications.attachments.read"
  | "advisor_applications.signatures.read_own"
  | "advisor_applications.approve"
  | "advisor_applications.reject"

  // 承辦人申請審核權限
  | "applications.review.list"
  | "applications.review.read"
  | "applications.history.list"
  | "applications.history.read"
  | "applications.revision.request"
  | "applications.revision.extend"
  | "applications.points.adjust_before_approval"
  | "applications.approve"
  | "applications.reject"

  // 承辦人與管理員共用的申請唯讀權限
  | "applications.attachments.read"
  | "applications.signatures.read"

  // 管理員專屬:申請唯讀
  | "applications.all.list"
  | "applications.all.read"
  | "application_review_actions.read"

  // 點數異動申請權限
  | "point_change_requests.list"
  | "point_change_requests.read"
  | "point_change_requests.create"
  | "point_change_requests.approve"
  | "point_change_requests.reject"

  // 點數規則管理
  | "point_rules.list"
  | "point_rules.create"
  | "point_rules.deactivate"

  // 學生點數流水帳
  | "student_point_transactions.read"

  // 使用者帳號管理
  | "users.list"
  | "users.read"
  | "users.create"
  | "users.update"
  | "users.activate"
  | "users.deactivate"
  | "users.activation.resend"
  | "users.password_reset.send"

  // 指導老師資料管理
  | "advisors.list"
  | "advisors.create"
  | "advisors.update"
  | "advisors.activate"
  | "advisors.deactivate"
  | "advisors.assign_director";

const rolePermissions: Record<Role, ReadonlySet<Permission>> = {
  advisor: new Set([
    "advisor_applications.pending.list",
    "advisor_applications.pending.read",
    "advisor_applications.history.list",
    "advisor_applications.history.read",
    "advisor_applications.attachments.read",
    "advisor_applications.signatures.read_own",
    "advisor_applications.approve",
    "advisor_applications.reject",
  ]),
  reviewer: new Set([
    "applications.review.list",
    "applications.review.read",
    "applications.history.list",
    "applications.history.read",
    "applications.attachments.read",
    "applications.signatures.read",
    "applications.revision.request",
    "applications.revision.extend",
    "applications.points.adjust_before_approval",
    "applications.approve",
    "applications.reject",
    "point_change_requests.list",
    "point_change_requests.create",
  ]),
  admin: new Set([
    "users.list",
    "users.read",
    "users.create",
    "users.update",
    "users.activate",
    "users.deactivate",
    "users.activation.resend",
    "users.password_reset.send",
    "advisors.list",
    "advisors.create",
    "advisors.update",
    "advisors.activate",
    "advisors.deactivate",
    "advisors.assign_director",
    "point_rules.list",
    "point_rules.create",
    "point_rules.deactivate",
    "point_change_requests.list",
    "point_change_requests.read",
    "point_change_requests.approve",
    "point_change_requests.reject",
    "applications.all.list",
    "applications.all.read",
    "applications.attachments.read",
    "applications.signatures.read",
    "application_review_actions.read",
    "student_point_transactions.read",
  ]),
};
```

權限總覽（共 45 個權限代碼）：

- 指導老師 8 個
- 承辦人 13 個（含 2 個與管理員共用：`applications.attachments.read`、`applications.signatures.read`；以及 `point_change_requests.list` 與管理員共用）
- 管理員 27 個（含與承辦人共用的 3 個）

實際實作時，必須列出文件中定義的全部權限，不使用萬用字元自動包含未來新增權限。權限新增或調整時，必須同步更新：

1. `Permission` 型別。
2. `rolePermissions` 對應的角色集合。
3. 下方〈指導老師〉、〈承辦人〉、〈管理員〉三節的權限代碼表與允許／禁止行為清單。
4. 〈權限矩陣〉表格。

### 權限檢查 Middleware

Authentication Middleware 負責確認使用者身分，Permission Middleware 負責確認該角色是否具有執行功能的權限。

```ts
const requirePermission = (permission: Permission) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;

    if (!role || !rolePermissions[role]?.has(permission)) {
      return res.status(403).json({
        status: "forbidden",
        message: "沒有執行此操作的權限",
      });
    }

    next();
  };
};
```

路由使用方式：

```ts
router.post(
  "/applications/:id/approve",
  authenticateToken,
  requirePermission("applications.approve"),
  asyncHandler(approveApplication)
);
```

### 授權責任分工

Permission Middleware 只能確認角色具有某項功能權限，不能單獨決定使用者是否能操作某筆特定資料。

| 層級 | 責任 |
| --- | --- |
| Authentication Middleware | 驗證登入身分、帳號是否啟用及 Token／Session 是否有效 |
| Permission Middleware | 驗證使用者角色是否具有該 API 功能權限 |
| Service | 驗證資料所有權、申請狀態、點數規則及完整業務條件 |
| Repository | 執行集中管理的參數化 SQL |
| PostgreSQL Constraint／Transaction | 保證唯一性、關聯、狀態更新及最終資料一致性 |

例如指導老師簽名時，除了具有 `advisor_applications.approve` 權限，Service 仍必須驗證：

- 申請的 `advisor_id` 對應目前登入老師。
- 申請狀態為 `pending_advisor`。
- 目前版本尚未被老師簽核。
- 使用者帳號及指導老師資料皆為啟用狀態。

承辦人核准申請時，除了具有 `applications.approve` 權限，Service 仍必須使用 Transaction 與資料列鎖重新驗證：

- 申請狀態仍為 `under_review`。
- 申請尚未被其他承辦人完成審核。
- 核准點數符合目前申請內容與點數規則。

### 指導老師 `advisor`

指導老師只能查看及處理 `point_applications.advisor_id` 對應自己的申請。

權限代碼：

| 權限代碼 | 說明 | 資料範圍 |
| --- | --- | --- |
| `advisor_applications.pending.list` | 查看等待自己簽核的申請列表 | 僅自己的申請 |
| `advisor_applications.pending.read` | 查看等待自己簽核的申請內容 | 僅自己的申請 |
| `advisor_applications.history.list` | 查看自己過去處理的申請列表 | 僅自己的申請 |
| `advisor_applications.history.read` | 查看自己過去處理的申請內容與歷史版本 | 僅自己的申請 |
| `advisor_applications.attachments.read` | 查看申請附件 | 僅自己的申請 |
| `advisor_applications.signatures.read_own` | 查看自己的歷史簽名 | 僅自己的簽名 |
| `advisor_applications.approve` | 簽名同意申請 | 僅自己的 `pending_advisor` 申請 |
| `advisor_applications.reject` | 填寫原因並拒絕申請 | 僅自己的 `pending_advisor` 申請 |

允許：

- 查看自己等待簽核及歷史申請的列表與內容。
- 查看自己負責申請的附件。
- 查看自己簽署的歷史版本、失效簽名及當時申請快照。
- 對自己的 `pending_advisor` 申請簽名同意。
- 對自己的 `pending_advisor` 申請填寫原因並拒絕。

禁止：

- 查看其他指導老師的申請。
- 修改申請內容、參與者與點數。
- 撤回已送出的同意或拒絕。
- 要求補件或執行承辦人核准。
- 管理帳號、教師、主任與點數規則。

主任即使 `advisors.is_director = true`，也不會取得查看其他老師申請的權限，只在最終核准後接收通知與備份。

### 承辦人 `reviewer`

系統允許多位承辦人帳號，主要用於交接。所有承辦人採自由搶案模式。

權限代碼：

| 權限代碼 | 說明 |
| --- | --- |
| `applications.review.list` | 查看等待審核申請列表 |
| `applications.review.read` | 查看單一等待審核申請 |
| `applications.history.list` | 查看歷史申請列表 |
| `applications.history.read` | 查看單一歷史申請 |
| `applications.attachments.read` | 查看及下載申請附件 |
| `applications.signatures.read` | 查看指導老師簽名 |
| `applications.revision.request` | 要求申請人補件 |
| `applications.revision.extend` | 延長補件期限 |
| `applications.points.adjust_before_approval` | 核准前調整申請認定與核准點數 |
| `applications.approve` | 核准一般申請 |
| `applications.reject` | 拒絕一般申請 |
| `point_change_requests.list` | 查看所有核准後點數異動申請歷史 |
| `point_change_requests.create` | 建立核准後點數異動或沖銷申請 |

允許：

- 查看所有等待審核及歷史申請的列表與內容。
- 查看申請附件及指導老師簽名。
- 要求申請人補件及延長補件期限。
- 核准前調整申請認定與核准點數。
- 核准或拒絕申請。
- 查看所有核准後點數異動申請的歷史。
- 建立核准後點數異動或沖銷申請。

禁止：

- 在申請處於 `needs_revision` 時直接拒絕申請。
- 撤回已送出的點數異動申請；內容錯誤時由管理員拒絕後重新提出。
- 直接異動或沖銷核准後點數。
- 核准或拒絕點數異動申請。
- 修改點數規則、帳號、指導老師或主任資料。
- 修改申請人提交的事實資料。
- 刪除申請、附件、簽名、審核紀錄或點數流水帳。

延長補件期限時必須填寫原因、建立審核操作紀錄，並由系統寄信通知申請人。

### 管理員 `admin`

系統同一時間只能存在一位啟用中的管理員。

權限代碼：

| 權限代碼 | 說明 |
| --- | --- |
| `users.list` | 查看使用者帳號列表 |
| `users.read` | 查看使用者帳號資料 |
| `users.create` | 建立使用者帳號 |
| `users.update` | 修改使用者基本資料 |
| `users.activate` | 啟用使用者帳號 |
| `users.deactivate` | 停用使用者帳號 |
| `users.activation.resend` | 重新寄送帳號啟用連結 |
| `users.password_reset.send` | 寄送密碼重設連結 |
| `advisors.list` | 查看指導老師列表 |
| `advisors.create` | 建立指導老師資料 |
| `advisors.update` | 修改指導老師資料 |
| `advisors.activate` | 啟用指導老師 |
| `advisors.deactivate` | 停用指導老師 |
| `advisors.assign_director` | 設定目前主任 |
| `point_rules.list` | 查看目前及歷史點數規則 |
| `point_rules.create` | 建立未來生效的新規則 |
| `point_rules.deactivate` | 設定舊規則失效日期 |
| `point_change_requests.list` | 查看所有核准後點數異動申請 |
| `point_change_requests.read` | 查看異動申請詳細資料 |
| `point_change_requests.approve` | 核准異動申請並建立點數流水帳 |
| `point_change_requests.reject` | 拒絕異動申請 |
| `applications.all.list` | 唯讀查看所有申請列表 |
| `applications.all.read` | 唯讀查看所有申請內容 |
| `applications.attachments.read` | 查看及下載所有申請附件 |
| `applications.signatures.read` | 查看所有指導老師簽名 |
| `application_review_actions.read` | 查看所有審核操作紀錄 |
| `student_point_transactions.read` | 查看學生點數流水帳 |

允許：

- 建立、啟用、停用與管理使用者帳號。
- 管理指導老師資料及主任身分。
- 唯讀查看所有申請、附件、指導老師簽名、審核紀錄與學生點數流水帳。
- 建立未來生效的點數規則及設定舊規則失效日期。
- 查看、核准或拒絕所有核准後點數異動申請。

禁止：

- 核准、拒絕或要求補件一般申請。
- 修改申請人提交的資料。
- 直接修改或刪除點數流水帳。
- 修改或刪除已生效、已被申請使用的歷史規則。
- 修改承辦人提出的點數異動內容；內容錯誤時只能拒絕。

管理員查看附件、簽名或其他敏感資料時，系統應保存稽核紀錄。

### 教師登入簽核流程

第一版不實作教師快速登入或 PIN。

指導老師收到簽核通知後：

1. 點擊 Email 中的簽核連結。
2. 尚未登入時，系統導向帳號密碼登入頁，並保存原始簽核頁面位置。
3. 登入成功後，系統直接導回指定申請的簽核頁面。
4. 系統驗證目前帳號是該申請的指導老師、申請狀態為 `pending_advisor`，且尚未超過 `advisor_confirmation_expires_at` 後，才允許查看及簽核。

若未來需要改善頻繁登入體驗，再另外評估信任裝置與 PIN 快速重新驗證；PIN 不可完全取代帳號密碼登入。

### 權限矩陣

| 功能 | 指導老師 | 承辦人 | 管理員 |
| --- | :---: | :---: | :---: |
| 查看自己負責的申請 | 可 | 可 | 可 |
| 查看所有一般申請 | 不可 | 可 | 唯讀 |
| 查看申請附件 | 僅自己的申請 | 可 | 可，需記錄稽核 |
| 指導老師簽名同意或拒絕 | 僅自己的申請 | 不可 | 不可 |
| 要求補件及延長補件期限 | 不可 | 可 | 不可 |
| 核准前調整認定與點數 | 不可 | 可 | 不可 |
| 核准或拒絕一般申請 | 不可 | 可 | 不可 |
| 建立核准後點數異動申請 | 不可 | 可 | 不可 |
| 核准或拒絕點數異動申請 | 不可 | 不可 | 可 |
| 直接修改點數流水帳 | 不可 | 不可 | 不可 |
| 管理點數規則 | 不可 | 不可 | 可 |
| 管理使用者帳號 | 不可 | 不可 | 可 |
| 管理指導老師與主任 | 不可 | 不可 | 可 |

### 後端權限映射

權限清單由後端程式統一維護。完整 `Permission` 型別與三個角色對應的 `rolePermissions` 集合請參考前文〈[角色與權限映射](#角色與權限映射)〉。

各權限代碼的業務語意請參考〈[指導老師](#指導老師-advisor)〉、〈[承辦人](#承辦人-reviewer)〉、〈[管理員](#管理員-admin)〉三節的權限代碼表。
