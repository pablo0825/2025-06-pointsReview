# 實作計畫總覽

本文件定義版本範圍、詳細計畫入口與 API 實作階段。第一版是可正式上線的核心系統，不是僅供展示的 Demo；第二版保留不阻塞核心申請流程的後續功能。

## 計畫文件

- [第一版實作計畫](implementation-plan-v1.md)：正式上線第一版的 Phase、checklist 與完成條件。
- [第二版實作 Backlog](implementation-backlog-v2.md)：已確認延後或尚待排序的功能，不代表已承諾實作時間。

## 版本原則

- 版本歸屬依產品可用性、相依關係與上線風險決定，不因功能較複雜就自動延後。
- Authentication、Authorization、CSRF、Rate Limit、資料完整性、必要 Email 投遞、私有檔案與 CI 是第一版正式上線條件。
- Audit log 寫入與 Email worker 是第一版；Audit log 管理查詢、Email task 管理查詢與手動重寄是第二版。
- 核准後點數異動與沖銷是第二版；第一版核准結果不可直接修改。
- 已存在於 migration 的第二版資料表與 constraint 保留，不重寫已建立的 migration；第一版不提供對應 API 與 Service。
- 每支公開 API 都必須有唯一版本與實作 Phase，並具備權限、request/response、Zod、Service、Transaction 與測試責任。

## 第一版範圍

- PostgreSQL migration、seed、Repository、Transaction 與共用 API 骨架。
- Login、Session、CSRF、角色權限、帳號啟用與密碼重設。
- 管理員使用者、指導老師、點數規則、人數規則與申請說明管理。
- 公開指導老師、申請說明、四類申請送件與附件上傳。
- 指導老師簽核、承辦人補件、核准與拒絕。
- 核准後點數流水帳與公開遮罩查詢。
- 必要 Email task 建立、投遞、有限重試、提醒與逾期工作。
- 私有附件與簽名讀取、Audit log 寫入、Rate Limit、部署安全與 CI。

## 第二版範圍

- 核准後點數異動與沖銷申請。
- Audit log 管理員列表與詳情 API。
- Email task 管理員列表、詳情與手動重寄 API。
- 報表、匯出、批次操作與進階維運功能。

## 第一版 API Phase 歸屬

| API 分組 | 實作 Phase | 說明 |
| --- | --- | --- |
| Auth 核心 | Phase 3 | Login、Logout、Me、CSRF、Authentication、Permission |
| 使用者與指導老師基礎管理 | Phase 4 | 不依賴 Email 的查詢、更新、啟用與停用 |
| 帳號生命週期與 Email | Phase 4.5 | 正式帳號建立、Activation、Password Reset、最小 Email worker |
| 規則、說明與公開送件 | Phase 5 | 點數／人數規則管理、申請說明、公開查詢與四類送件 |
| 指導老師簽核 | Phase 6 | 待簽列表、詳情、同意、拒絕與簽名 |
| 承辦人審核與管理員申請查詢 | Phase 7 | 補件、調整、核准、拒絕與管理員唯讀查詢 |
| 點數流水帳與公開查詢 | Phase 8 | Award 流水帳、公開遮罩總表與管理員流水帳查詢 |
| 上線安全收斂 | Phase 9 | Auth 與公開 API Rate Limit、登入失敗鎖定 |
| 背景工作、私有檔案與 CI | Phase 10 | 逾期工作、私有檔案、部署安全、migration verification 與回歸測試 |

第二版 API 不放入第一版 Phase checklist，統一收錄於 [第二版實作 Backlog](implementation-backlog-v2.md)。API contract、權限與測試文件會標示版本，避免「資料表已存在」被誤解為「第一版功能已開放」。

## 目前進度

目前已完成 PostgreSQL migration、共用後端骨架、PostgreSQL app/server 啟動隔離與 Auth 核心主要程式。下一步依 [第一版實作計畫](implementation-plan-v1.md#目前補強-sprint) 補齊 Phase 2 與 Phase 3 自動化測試，再進入管理資料 API。
