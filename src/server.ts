import type { Server } from "http";

import { createApp } from "./app";
import { env, getLegacyMongoConnectionString } from "./config/env";
import { verifyPostgresConnection } from "./db/pool";

// 註冊 process 層級錯誤處理，避免未捕捉錯誤安靜地被忽略。
function registerProcessHandlers(): void {
  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception！伺服器即將關閉...");
    console.error(err);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason: unknown) => {
    console.error("未捕捉的 Rejection：", reason);
  });
}

// 只有在啟用舊 Mongo 流程時，才動態載入 Mongoose、舊 routes 與舊背景 jobs。
async function loadLegacyMongoRuntime() {
  const mongoose = await import("mongoose");
  await mongoose.default.connect(getLegacyMongoConnectionString());
  console.log("✅ MongoDB connected");

  const [
    competitionFormRouteModule,
    competitionFormAdminRouteModule,
    emailQueueJobModule,
    advisorTokenExpiryJobModule,
  ] = await Promise.all([
    import("./routes/competitionForm.route"),
    import("./routes/competitionForm.admin.route"),
    import("./jobs/emailQueue.job"),
    import("./jobs/advisorTokenExpiry.job"),
  ]);

  return {
    routes: {
      competitionFormRoute: competitionFormRouteModule.default,
      competitionFormAdminRoute: competitionFormAdminRouteModule.default,
    },
    // 舊背景任務需等 Mongo 連線與 server 初始化後再啟動。
    startJobs: () => {
      emailQueueJobModule.startEmailQueueJob();
      advisorTokenExpiryJobModule.startAdvisorTokenExpiryJob();
    },
  };
}

// 啟動 HTTP server；測試可直接使用 createApp()，避免 listen、Mongo 連線與 jobs 自動執行。
export async function startServer(): Promise<Server> {
  registerProcessHandlers();

  await verifyPostgresConnection();

  // 新 PostgreSQL 主流程不依賴舊 Mongo；只有設定開啟時才載入舊 runtime。
  const legacyMongoRuntime = env.enableLegacyMongo
    ? await loadLegacyMongoRuntime()
    : undefined;

  // createApp 只負責組裝 Express app，外部連線與 listen 留在 server 啟動流程。
  const app = createApp({
    legacyMongoRoutes: legacyMongoRuntime?.routes,
  });

  // 實際開始監聽 HTTP port。
  const server = app.listen(env.port, () => {
    console.log(`Server is running on http://localhost:${env.port}`);
  });

  // 如果舊 Mongo runtime 有啟用，server 啟動後再啟動舊背景任務。
  legacyMongoRuntime?.startJobs();

  return server;
}
