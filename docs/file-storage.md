# 私有檔案儲存設計

本文件定義第一版附件與指導老師簽名檔案的私有儲存方式、`storage_key` 語意、上傳與讀取流程、安全限制、備份與失敗處理。資料表欄位請參考 [資料模型](data-model.md)，私有檔案 API 請參考 [API 與 Service 邊界](api-service-boundaries.md#私有檔案-api)。

## 設計目標

- 附件與簽名檔案不得使用公開靜態網址。
- 資料庫只保存 `storage_key`，不保存公開 URL、作業系統絕對路徑或 storage provider 的完整內部路徑。
- 檔案只能透過後端 API 經身分驗證、權限檢查與資料範圍檢查後串流讀取。
- 第一版使用伺服器本機私有目錄，並透過 storage adapter 封裝，讓未來可替換為 S3、MinIO 或其他物件儲存。
- 附件與簽名跟隨申請歷史長期保存，不由一般使用者刪除。
- 管理員、承辦人或指導老師讀取敏感檔案時，依 [通用系統稽核紀錄](audit-logs.md) 建立查看紀錄。

## 第一版儲存方式

第一版採用伺服器本機私有目錄。

建議設定：

```text
PRIVATE_FILE_STORAGE_ROOT=/var/lib/points-review/private-files
```

規則：

- `PRIVATE_FILE_STORAGE_ROOT` 必須位於 Web server 公開靜態目錄之外。
- 應用程式只能透過 storage adapter 存取此目錄，不在 Controller 或 Service 中直接組檔案路徑。
- 目錄權限應限制為應用程式執行帳號可讀寫，其他系統帳號不可讀取。
- 正式環境應將此目錄納入備份。
- 若部署多台 application instance，本機私有目錄不再適合，應改用共享檔案系統、S3 或 MinIO。

## Storage Key

`storage_key` 是系統內部檔案識別值，不是 URL，也不是作業系統絕對路徑。

建議格式：

```text
attachments/{applicationPublicId}/{versionNumber}/{attachmentPublicId}.{ext}
signatures/{applicationPublicId}/version-{versionNumber}/{signatureId}.png
```

範例：

```text
attachments/550e8400-e29b-41d4-a716-446655440000/1/7d9a2f9a-67d7-4c81-8d0e-a65d07a7d901.pdf
signatures/550e8400-e29b-41d4-a716-446655440000/version-2/12345.png
```

規則：

- `storage_key` 必須由後端產生，不接受前端直接指定。
- `storage_key` 只能包含後端允許的安全字元，例如英數、`/`、`-`、`_`、`.`。
- 寫入與讀取檔案前，storage adapter 必須檢查 `storage_key` 正規化後仍位於 `PRIVATE_FILE_STORAGE_ROOT` 底下，防止路徑穿越。
- 不使用原始檔名作為儲存路徑；原始檔名只保存於 `application_attachments.original_filename`。
- API response 不回傳 `storage_key`。

## Storage Adapter

建議定義 storage adapter 介面，第一版實作 `LocalPrivateFileStorage`。

```ts
import type { Readable } from "node:stream";

type StoredFile = {
  storageKey: string;
  mimeType: string;
  fileSize: number;
};

interface PrivateFileStorage {
  save(params: {
    storageKey: string;
    content: Readable | Buffer;
    expectedMimeType: string;
  }): Promise<StoredFile>;

  openReadStream(storageKey: string): Promise<{
    stream: Readable;
    fileSize: number;
  }>;

  exists(storageKey: string): Promise<boolean>;
}
```

Service 負責產生 `storage_key`、驗證業務權限與建立資料庫紀錄。Storage adapter 只負責安全讀寫檔案，不判斷使用者權限。

第一版不提供一般刪除介面。若 Transaction 失敗後需要清理本次剛寫入但尚未入庫的檔案，可由 Service 在 catch 區塊呼叫內部 cleanup 方法；此 cleanup 不對外暴露為業務刪除功能。

## 上傳分層

檔案上傳流程分成四種責任：

- Upload middleware 或 multipart parser：接收 multipart request，限制 request body、檔案數量與單檔大小。
- Controller：解析 request，對非檔案欄位與附件 metadata 執行 Zod 驗證。
- `FileValidator`：檔案驗證 helper/module，驗證副檔名、宣告 MIME type、實際檔案內容、圖片尺寸，以及拒絕不允許的檔案格式。
- 業務 Service：驗證申請狀態、資料所有權與權限，產生 `storage_key`，控制 Transaction，建立資料庫紀錄並呼叫 Storage adapter。

`FileValidator` 不是業務 Service，不處理申請狀態、權限、Transaction、點數計算或資料庫寫入。它可由 Controller 或業務 Service 呼叫；實作時也可依框架限制整合在 upload middleware 後段，但不應只信任 request 宣告的 MIME type。

## 附件上傳

附件與申請資料在同一次送出流程中建立。第一版不提供送件前暫存附件。

流程：

1. Upload middleware 或 multipart parser 接收 multipart request。
2. Upload middleware 限制 request body 大小、檔案數量與單檔大小，超過限制時在進入 Service 前拒絕。
3. Controller 解析非檔案欄位與附件 metadata，並交由 Zod 驗證。
4. `FileValidator` 驗證副檔名、宣告 MIME type 與實際檔案內容。
5. Service 建立申請、版本與附件資料所需的 `storage_key`。
6. Service 在 Transaction 中建立申請資料與 `application_attachments` metadata。
7. Storage adapter 將已驗證檔案寫入私有儲存。
8. 任一步驟失敗時 rollback 資料庫；若檔案已寫入但資料庫 rollback，清理本次新寫入檔案。

實作時可依框架限制決定先寫暫存檔或先串流到私有儲存，但 commit 前必須確保：

- 資料庫 metadata 與檔案實體一致。
- 不留下已入庫但不存在的檔案。
- 不把未通過驗證的檔案永久保存。

Phase 5 使用 Multer 將新上傳寫入 OS 臨時目錄，不將最多 `50 MB` 的 request 全部保留在 Node.js heap。`FileValidator` 完成副檔名、宣告 MIME 與實際內容驗證後，Service 才透過 storage adapter 移入私有儲存。無論驗證、Transaction 或儲存成功失敗，request 結束前都必須清除本次臨時檔案。

第一版附件限制：

- 每筆申請最多 `10` 個附件。
- 每個附件最多 `5 MB`。
- 允許 `application/pdf`、`image/jpeg`、`image/png`。
- 不允許 ZIP、RAR 等壓縮檔。

## 指導老師簽名儲存

簽名板固定輸出 PNG。

第一版簽名限制：

- MIME type 必須為 `image/png`。
- 實際檔案內容必須驗證為 PNG。
- 副檔名固定使用 `.png`。
- 最大檔案大小固定為 `1 MB`，屬後端硬限制。
- 最大尺寸固定為 `1600 x 800` pixels，屬後端硬限制。

簽名流程：

1. 指導老師登入並開啟待簽核申請。
2. 前端簽名板輸出 PNG。
3. Upload middleware 或 multipart parser 接收簽名檔與同意操作，並限制 request body 與單檔大小。
4. `FileValidator` 驗證 MIME type、實際 PNG 內容與圖片尺寸。
5. Service 鎖定 `point_applications`，驗證狀態、期限、指導老師身分與目前版本。
6. Service 產生 `signature_storage_key`。
7. Storage adapter 將已驗證簽名檔寫入私有儲存。
8. 在同一個 Transaction 中建立 `advisor_signatures`、審核操作紀錄，並更新申請狀態。

若資料庫 Transaction 失敗，Service 必須清理本次新寫入的簽名檔案。若檔案寫入失敗，整個簽核操作不得成立。

## 私有檔案讀取

所有附件與簽名讀取都必須透過後端 API。

讀取流程：

1. Authentication Middleware 驗證登入 session。
2. Permission Middleware 驗證功能權限。
3. Service 依申請、附件或簽名資料重新檢查資料範圍。
4. Service 取得 `storage_key`。
5. Storage adapter 開啟 read stream。
6. Controller 設定 `Content-Type`、`Content-Length` 與安全 header 後串流回應。
7. 對敏感檔案查看建立 `audit_logs`。

建議 response header：

```text
Content-Type: {mime_type}
Content-Length: {file_size}
Content-Disposition: inline; filename="{safe_filename}"
X-Content-Type-Options: nosniff
Cache-Control: no-store
```

附件可依 MIME type 使用 `inline` 或 `attachment`；簽名圖片建議使用 `inline`。`safe_filename` 必須經過 header-safe 處理，不直接信任原始檔名。

若檔案實體不存在：

- 回傳 `404` 或 `500` 由實作依情境決定，但不得洩漏 `storage_key`。
- 建立 `file_missing` 類型的 log 或 audit metadata，供維運追查。
- 不得自動刪除資料庫 metadata。

## 稽核紀錄

讀取敏感檔案時應建立 `audit_logs`。

建議 action：

- 附件：`application_attachment.viewed`
- 簽名：`advisor_signature.viewed`

建議 metadata：

```json
{
  "applicationPublicId": "550e8400-e29b-41d4-a716-446655440000",
  "attachmentPublicId": "7d9a2f9a-67d7-4c81-8d0e-a65d07a7d901",
  "fileType": "attachment"
}
```

metadata 不得保存完整 `storage_key` 或檔案內容。

## 備份與復原

第一版備份復原目標：

- RPO：`24` 小時，最壞情況可接受遺失最近一天內的資料。
- RTO：`24` 小時，事故後目標在一天內恢復服務。
- 第一版預期由維運者遠端執行復原操作。

正式環境必須同時備份：

- PostgreSQL database。
- `PRIVATE_FILE_STORAGE_ROOT` 私有檔案目錄。
- 必要部署設定與密鑰保存方式，例如環境變數、volume mount、cookie/session secret 與備份解密金鑰；實際密鑰不得放入 git repository。

備份原則：

- 第一版正式環境每日備份一次 PostgreSQL 與 `PRIVATE_FILE_STORAGE_ROOT`。
- 若 PostgreSQL 以 Docker container 執行，資料必須放在 persistent volume 或受控資料目錄；備份應使用 PostgreSQL dump、受控快照或等價方式，不把 container 本身視為備份。
- 申請截止日前後或集中審核期間，可暫時提高為每日兩次備份。
- 資料庫與檔案目錄應盡量使用相近時間點的備份。
- 復原時必須同時復原資料庫與檔案目錄，避免 metadata 指向不存在檔案。
- 備份必須加密。
- 備份不得只保存在正式主機本機或同一個 Docker container 內；至少需複製到正式主機外的受控位置，例如學校 NAS、另一台受控主機、S3、MinIO 或其他備份儲存。
- 第一版建議保留最近 `7` 天每日備份，並保留最近 `4` 週每週備份。
- 定期抽查 `application_attachments.storage_key` 與 `advisor_signatures.signature_storage_key` 是否能開啟實體檔案。
- 正式上線前必須至少執行一次復原演練；上線後建議每學期或每半年演練一次。

復原演練最小檢查項目：

1. 停止 app 與 worker，避免復原期間繼續寫入。
2. 建立新的 PostgreSQL database，匯入資料庫備份。
3. 還原 `PRIVATE_FILE_STORAGE_ROOT`。
4. 設定環境變數、volume mount 與必要密鑰。
5. 啟動 app 與 worker。
6. 驗證登入、申請列表、附件下載、簽名查看與學生點數查詢。
7. 抽查或批次檢查 `storage_key` 對應檔案是否存在。

第一版不在資料庫保存檔案 checksum。若未來需要更完整的完整性檢查，可新增 `checksum_sha256` 欄位。

## 未來替換為 S3 或 MinIO

Storage adapter 必須隔離 provider 差異。未來改為 S3 或 MinIO 時：

- 資料庫 `storage_key` 可保持不變，作為 object key。
- API 權限與稽核邏輯不變。
- 後端仍應透過 API 串流或短效 signed URL。若使用 signed URL，必須確保期限很短、不可公開列目錄，並評估稽核紀錄是否仍能完整記錄查看行為。
- 不應把 bucket public-read。

第一版不使用 signed URL，所有檔案都由後端 API 串流。
