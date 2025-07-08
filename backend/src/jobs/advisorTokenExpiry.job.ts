import cron from "node-cron";
import { processAdvisorTokenExpiryQueue } from "../tasks/processAdvisorTokenExpiryQueue";

// 每 5 分鐘執行一次
export const startAdvisorTokenExpiryJob = () => {
  cron.schedule("*/10 * * * *", async () => {
    console.log("[Cron] 開始執行 advisor token 過期檢查任務...");
    try {
      await processAdvisorTokenExpiryQueue();
      console.log("[Cron] advisor token 檢查完成。");
    } catch (err) {
      console.error("[Cron] advisor token 任務失敗：", err);
    }
  });
};
