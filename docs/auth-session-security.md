# 登入、Session 與安全設計

本文件定義第一版登入方式、Session、帳號啟用、密碼重設、Cookie、CSRF、CORS、Rate Limit 與敏感資料遮罩政策。角色與權限請參考 [帳號與權限](authorization.md)，Auth API 邊界請參考 [API 與 Service 邊界](api-service-boundaries.md#auth-api)。

## 登入方案

第一版建議使用 **server-side session + HttpOnly cookie**。

原因：

- 系統主要是同站 Web 後台與指導老師簽核，不需要一開始支援第三方 API 或 mobile app。
- Session 可由伺服器集中撤銷，適合帳號停用、角色變更、密碼重設與管理員移交。
- Cookie 設定正確時，前端不需要保存 access token，降低 token 被 XSS 讀取的風險。

暫不採用 access token + refresh token。若未來需要 mobile app、跨網域前端或第三方 API，再另行評估。

## Session 儲存

第一版使用 `user_sessions` 資料表保存可撤銷的 server-side session。

正式欄位與 SQL 請參考 [資料模型 - user_sessions](data-model.md#使用者-session-user_sessions) 與 [資料庫 Schema - user_sessions](database-schema.md#user_sessions)。

Session token 原文只放在瀏覽器 cookie；資料庫只保存 token hash。CSRF token 綁定 `user_sessions`，資料庫只保存 `csrf_token_hash`。

不建議使用無狀態 JWT 作為第一版登入 session，避免帳號停用、角色變更與密碼重設後無法集中撤銷。

## Cookie 設定

登入成功後，後端設定 session cookie。

建議：

```text
HttpOnly = true
Secure = true
SameSite = Lax
Path = /
```

規則：

- `HttpOnly` 必須開啟，避免前端 JavaScript 讀取 session token。
- 正式環境 `Secure` 必須開啟，只允許 HTTPS 傳送。
- 第一版若前後端同站部署，`SameSite = Lax` 足夠。
- 若 frontend 與 backend 是不同容器，但透過 reverse proxy 對外提供同一個 HTTPS origin，例如 `https://points.example.edu` 與 `/api`，仍視為同源部署。
- 若未來前後端跨站部署且需要 cookie，才評估 `SameSite = None; Secure`，並加強 CSRF 防護。

## Session 有效期限

第一版建議：

- 閒置有效期限：`8` 小時。
- 絕對有效期限：`7` 天。
- 每次成功驗證 session 時更新 `last_seen_at`。
- 超過閒置期限或絕對期限後，session 無效。

若系統部署在共用電腦環境，正式上線前可將閒置期限縮短為 `2` 至 `4` 小時。

## Session 失效規則

以下事件必須撤銷相關 session：

| 事件 | 處理 |
| --- | --- |
| 使用者登出 | 撤銷目前 session |
| 帳號停用 | 撤銷該使用者所有 session |
| 密碼重設成功 | 撤銷該使用者所有既有 session，保留或建立新的登入狀態由實作決定 |
| 角色變更 | 撤銷該使用者所有 session |
| 管理員移交 | 撤銷舊管理員所有 session |
| 管理員帳號復原 | 撤銷目標管理員所有 session |

Authentication Middleware 每次驗證都必須檢查：

- session 存在且未過期。
- session 未被撤銷。
- 對應 `users.is_active = TRUE`。
- 對應 `users.activated_at IS NOT NULL`。

## 帳號啟用

帳號啟用流程：

1. 管理員建立帳號。
2. 後端產生高 entropy activation token。
3. 資料庫只保存 SHA-256 token hash 與 `activation_token_expires_at`。
4. Email 寄出原始 token 連結。
5. 使用者開啟連結並設定密碼。
6. 成功後寫入 `password_hash`、`activated_at`，清除 activation token hash 與到期時間。
7. 一般帳號將 `is_active` 設為 `TRUE`；若是管理員移交候選帳號，且系統已存在啟用中的管理員，帳號維持 `is_active = FALSE`，等待管理員移交流程啟用。

啟用 token 有效期限建議為 `24` 小時。

啟用連結過期後，只能由管理員重寄。重寄時必須產生新的 token，舊 token 立即失效。

## 密碼重設

密碼重設流程：

1. 使用者或管理員要求寄送密碼重設信。
2. 後端產生高 entropy reset token。
3. 資料庫只保存 SHA-256 token hash 與 `password_reset_token_expires_at`。
4. Email 寄出原始 token 連結。
5. 使用者設定新密碼。
6. 成功後更新 `password_hash`，清除 reset token hash 與到期時間。
7. 撤銷該使用者既有 session。

密碼重設 token 有效期限建議為 `30` 分鐘。

密碼重設 API 不應揭露 Email 是否存在；對外回應統一顯示「若帳號存在，系統會寄送重設信」。

## 密碼規則

第一版建議：

- 長度至少 `12` 字元。
- 不強制要求大小寫、數字、符號組合，避免使用者建立可預測密碼。
- 禁止常見弱密碼，例如 `password123`。
- 不允許與 Email local part 完全相同。

密碼雜湊建議使用 Argon2id；若環境暫不支援，才退而使用 bcrypt，成本參數需依部署環境壓測設定。

## 登入失敗防護

第一版建議同時做帳號與 IP 維度限制。

帳號維度：

- 同一 Email 連續失敗 `5` 次後，暫時鎖定 `15` 分鐘。
- 成功登入後清除該帳號失敗計數。

IP 維度：

- 同一 IP 對登入 API 每 `15` 分鐘最多 `30` 次嘗試。
- 超過限制回傳 `429`。

錯誤訊息不得透露帳號是否存在，統一回應「帳號或密碼錯誤」。

## CSRF

因第一版使用 cookie session，會有 CSRF 風險。

第一版建議：

- `SameSite = Lax` 作為基本防護。
- 所有 state-changing API 使用 CSRF token。
- 登入建立 session 時，後端同時使用 crypto random bytes 產生 CSRF token，建議至少 `32` bytes random 並轉為 base64url 字串。
- `user_sessions.csrf_token_hash` 只保存 CSRF token 的 SHA-256 hash，不保存原始 token。
- 前端透過 `GET /auth/csrf-token` 取得原始 CSRF token，並在 state-changing API 使用 `X-CSRF-Token` header 帶回。
- 後端驗證 header token hash 與目前 session 綁定的 `csrf_token_hash` 一致。
- 第一版採每個 session 一個 CSRF token；登出、session 過期或 session 被撤銷時一併失效。
- CSRF token 缺漏、格式錯誤或驗證失敗時，回傳 `403` 與錯誤碼 `csrf_token_invalid`。
- 前端在登入成功後、頁面初始化且已有有效 session 時，呼叫 `GET /auth/csrf-token` 取得 token。
- 前端收到 `csrf_token_invalid` 時，可重新呼叫 `GET /auth/csrf-token` 一次並重試原操作；若仍失敗，要求使用者重新整理頁面或重新登入。
- 登出後前端必須清除記憶體中的 CSRF token。

公開 API 若不使用 session cookie，例如建立申請、補件 token、公開點數查詢，仍需 rate limit，但不一定需要 CSRF token。

## CORS

第一版若前後端同源部署：

- 不需要開放跨網域 CORS。
- 僅允許 same-origin request。
- frontend 與 backend 即使分屬不同容器，只要經 reverse proxy 對外維持同一個 origin，仍屬於此情境。

若開發環境需要跨 origin：

- 只允許明確列出的 localhost origin。
- 不使用 `*` 搭配 credentials。
- 正式環境 CORS allowlist 必須明確設定。

## Rate Limit

第一版建議：

| API | 限制 |
| --- | --- |
| `POST /auth/login` | 每 IP 每 15 分鐘 30 次；每帳號連續失敗 5 次鎖 15 分鐘 |
| `POST /auth/password-reset/request` | 每 Email 每小時 3 次；每 IP 每小時 20 次 |
| `POST /auth/activation/:token` | 每 IP 每小時 30 次 |
| `POST /public/applications` | 每 IP 每小時 20 次 |
| `GET /public/applications/revisions/:token` | 每 IP 每小時 60 次 |
| `POST /public/applications/revisions/:token` | 每 IP 每小時 20 次 |
| `GET /public/student-points` | 每 IP 每分鐘 60 次 |

第一版正式環境使用 Redis-backed rate limit。Local development 與單元測試可使用 in-memory store，但不可作為正式部署設定。

Rate limit key 依場景選擇：

- 登入與公開 API：以 IP 為主要限制維度。
- 登入失敗鎖定：以 Email normalize 後的帳號識別加上失敗次數限制。
- 密碼重設：同時限制 Email 與 IP。
- 登入後 API：可依 `user_id` 限制高頻操作。

Redis 只保存 rate limit counter、window 到期時間與必要的鎖定狀態，不保存密碼、原始 token、session token 或 CSRF token。

## 公開 API 防濫用

公開申請 API：

- 限制 request body 大小。
- 限制附件數量與檔案大小。
- 檔案格式需依 [資料模型](data-model.md#申請附件-application_attachments) 驗證。
- 不接受 ZIP/RAR 等壓縮檔。

補件 token API：

- token 原文只存在 Email 連結。
- 資料庫只存 hash。
- 成功重新提交後立即清除 token。
- token 錯誤、過期、已使用時回覆一致錯誤，不透露詳細原因。

公開學生點數查詢：

- 必須分頁。
- 姓名與學號在 response 中遮罩。
- 限制 query 長度。
- 防止大量枚舉學號；若觀察到濫用，再加入更嚴格的 IP 或行為限制。

## 私有檔案存取

附件與簽名檔案不得使用公開靜態網址。

讀取檔案時必須：

- 驗證使用者已登入。
- 驗證使用者有對應權限。
- Service 驗證資料所有權或角色資料範圍。
- 依 [通用系統稽核紀錄](audit-logs.md) 記錄敏感檔案查看稽核紀錄。

檔案 response 不應洩漏 storage key。檔案儲存、讀取 header 與缺檔處理請參考 [私有檔案儲存設計](file-storage.md)。

## Log 與錯誤遮罩

不得寫入 log：

- 密碼。
- 原始 activation token、password reset token、edit token。
- token hash。
- session token。
- CSRF token。
- 簽名檔案內容。
- 附件檔案內容。

應遮罩或避免記錄：

- Email：可記錄 domain，local part 部分遮罩。
- 學號：公開查詢 log 中只記錄遮罩後學號或 hash。
- 姓名：公開查詢 log 中避免記錄完整姓名。
- 電話：僅在必要稽核時記錄，預設遮罩。

錯誤回應不得包含：

- SQL error 原文。
- stack trace。
- token 驗證失敗的詳細原因。
- 檔案 storage key。

## Auth API 與 Service 影響

`AuthService.login` 必須：

- 正規化 Email。
- 驗證登入失敗限制。
- 驗證密碼。
- 驗證 `users.is_active` 與 `activated_at`。
- 建立 session 與該 session 綁定的 CSRF token hash。
- 更新 `last_login_at`。

`AuthService.logout` 必須撤銷目前 session。

`AccountActivationService.activate` 與 `PasswordResetService.resetPassword` 必須在 Transaction 中清除 token hash，避免 token 重複使用。

## 尚待實作時確認

- Redis rate limit key 命名、window 設定與 middleware 套件。
- Argon2id/bcrypt 的實際參數。
- Session cookie 名稱與 domain。
