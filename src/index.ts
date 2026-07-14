// index.ts
// 載入環境變數
import dotenv from "dotenv";
dotenv.config({ path: "./config.env" });

// 載入模組
import express from "express";
import { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import createError from "http-errors";
import logger from "morgan";
import mongoose from "mongoose";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import competitionFormRoute from "./routes/competitionForm.route";
import competitionFormAdminRoute from "./routes/competitionForm.admin.route";
import authRoute from "./routes/auth.route";
import { AppError } from "./utils/AppError";
import { startEmailQueueJob } from "./jobs/emailQueue.job";
import { startAdvisorTokenExpiryJob } from "./jobs/advisorTokenExpiry.job";
import { errorHandler } from "./middlewares/errorHandler.middleware";

// 處理未捕捉的例外（同步錯誤）
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception！伺服器即將關閉...");
  console.error(err);
  process.exit(1);
});

/* 檢查DATABASE和DATABASE_PASSWORD是否存在*/
if (!process.env.DATABASE || !process.env.DATABASE_PASSWORD) {
  throw new AppError(
    500,
    "false",
    "❌ DATABASE 或 DATABASE_PASSWORD 環境變數未設定",
  );
}

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  throw new AppError(
    500,
    "false",
    "❌ EMAIL_USER 或 EMAIL_PASS 環境變數未設定",
  );
}

if (!process.env.FRONTEND_URL) {
  throw new AppError(500, "false", "❌ FRONTEND_URL 環境變數未設定");
}

/* 替換資料庫密碼 */
const DB = process.env.DATABASE?.replace(
  "<db_password>",
  process.env.DATABASE_PASSWORD,
);

/* 連接資料庫 */
mongoose
  .connect(DB)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

/* 檢查PORT是否存在 */
if (!process.env.PORT) {
  throw new Error("❌ PORT 環境變數未設定");
}

/* 初始化 */
const app = express();
const PORT = process.env.PORT || 3001;

/* 中間件 */
// 跨域請求
// 安全防禦
// 請求日誌
// 解析JSON的body
// 解析表單格式的body
// 處理靜態資源public
app.use(cors());
app.use(helmet());
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

/* 註冊路由 */
app.use("/api/form/competition", competitionFormRoute);
app.use("/api/admin/form/competition", competitionFormAdminRoute);
app.use("/auth", authRoute);

/*  */
startEmailQueueJob();
startAdvisorTokenExpiryJob();

/* app.use("/uploads", express.static(path.join(__dirname, "uploads"))); */

/* 捕獲404 */
app.use(function (req: Request, res: Response, next: NextFunction) {
  next(createError(404, "找不到路由"));
});

/* 錯誤處理中間件 */
app.use(errorHandler);

// 處理未捕捉的 rejection（非同步錯誤）
process.on("unhandledRejection", (reason: any) => {
  console.error("未捕捉的 Rejection：", reason);

  // process.exit(1);
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
