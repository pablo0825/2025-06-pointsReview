# 第二版實作 Backlog

本文件收錄不阻塞第一版正式上線的後續功能。Backlog 只表示版本歸屬，不代表已排定開發時間；開始第二版前仍需重新確認需求、API contract、權限、Migration 影響與驗收條件。

## 核准後點數異動與沖銷

目標：承辦人不能直接修改已核准點數，只能提出異動申請，由管理員核准或拒絕；核准後新增不可變的 adjustment 或 reversal 流水帳。

候選 API：

```text
GET  /reviewer/point-change-requests
POST /reviewer/point-change-requests
GET  /admin/point-change-requests
GET  /admin/point-change-requests/:publicId
POST /admin/point-change-requests/:publicId/approve
POST /admin/point-change-requests/:publicId/reject
```

實作前需重新確認：

- Adjustment 與 reversal 的數值限制及多次異動計算方式。
- 同一目標交易是否只允許一筆 pending request。
- 平行核准、資料列鎖定、Audit log 與 Email 通知。
- 前端如何呈現原始、已異動、已沖銷與目前有效點數。

`student_point_change_requests`、`student_point_transactions.transaction_type` 與相關 constraint 已存在於第一版 migration，作為第二版預留。第一版不提供上述 API，不允許以一般後台直接更新既有 award 流水帳。

## Audit Log 管理查詢

Audit log 寫入是第一版必要功能；以下管理查詢 API 延後到第二版：

```text
GET /admin/audit-logs
GET /admin/audit-logs/:auditLogId
```

第二版需補分頁、篩選、保存期限、敏感 metadata 遮罩與查詢權限測試。

## Email Task 管理

Email task 建立、worker 投遞、有限重試、failed 狀態與必要失敗通知是第一版；以下管理 API 延後到第二版：

```text
GET  /admin/email-tasks
GET  /admin/email-tasks/:emailTaskId
POST /admin/email-tasks/:emailTaskId/retry
```

手動重寄必須建立新 task，不覆蓋原 failed task，並保留 `retryOfEmailTaskId` 或等效來源資訊及 Audit log。

## 其他候選功能

- 年度、班級、申請類型與點數來源報表。
- CSV／試算表匯出。
- 批次帳號、指導老師或規則匯入。
- 進階通知頻率與收件者設定。
- Audit log 封存、Email task 維運儀表板與背景工作監控。

## 第二版啟動條件

- 第一版核心申請流程已正式運作並有穩定資料。
- 已蒐集實際點數更正、Email 維運與稽核查詢需求。
- 第二版功能有明確產品流程、權限、API contract、Zod、Transaction 與測試設計。
- 不以直接修改正式資料庫取代尚未實作的第二版功能。
