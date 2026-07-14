import type { Server } from "http";

import { createApp } from "./app";
import { env, getLegacyMongoConnectionString } from "./config/env";

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
    startJobs: () => {
      emailQueueJobModule.startEmailQueueJob();
      advisorTokenExpiryJobModule.startAdvisorTokenExpiryJob();
    },
  };
}

export async function startServer(): Promise<Server> {
  registerProcessHandlers();

  const legacyMongoRuntime = env.enableLegacyMongo
    ? await loadLegacyMongoRuntime()
    : undefined;

  const app = createApp({
    legacyMongoRoutes: legacyMongoRuntime?.routes,
  });

  const server = app.listen(env.port, () => {
    console.log(`Server is running on http://localhost:${env.port}`);
  });

  legacyMongoRuntime?.startJobs();

  return server;
}
