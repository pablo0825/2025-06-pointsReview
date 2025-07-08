import cron from "node-cron";
import { processEmailQueue } from "../tasks/processEmailQueue";

// 每 10 分鐘執行一次任務
export const startEmailQueueJob = () => {
  cron.schedule("*/10 * * * *", async () => {
    console.log("[Cron] 啟動 Email 任務...");
    try {
      await processEmailQueue();
      console.log("[Cron] advisor token 檢查完成。");
    } catch (err) {
      console.error("[Cron] advisor token 任務失敗：", err);
    }
  });
};
