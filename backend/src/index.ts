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
import { ZodError } from "zod";
import competitionFormRoute from "./routes/competitionForm.route";
import competitionFormAdminRoute from "./routes/competitionForm.admin.route";
import authRoute from "./routes/auth.route";
import userAdminRoute from "./routes/user.admin.route";
import { AppError } from "./utils/AppError";

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
    "❌ DATABASE 或 DATABASE_PASSWORD 環境變數未設定"
  );
}

if (
  !process.env.JWT_ACCESS_SECRET ||
  !process.env.JWT_REFRESH_SECRET ||
  !process.env.JWT_RESET_SECRET
) {
  throw new AppError(
    500,
    "false",
    "❌ JWT_ACCESS_SECRET, JWT_REFRESH_SECRET 或 JWT_RESET_SECRET 環境變數未設定"
  );
}

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  throw new AppError(
    500,
    "false",
    "❌ EMAIL_USER 或 EMAIL_PASS 環境變數未設定"
  );
}

if (!process.env.FRONTEND_URL) {
  throw new AppError(500, "false", "❌ FRONTEND_URL 環境變數未設定");
}

/* 替換資料庫密碼 */
const DB = process.env.DATABASE?.replace(
  "<db_password>",
  process.env.DATABASE_PASSWORD
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
app.use(express.static(path.join(__dirname, "public")));

/* 註冊路由 */
app.use("/api/form/competition", competitionFormRoute);
app.use("/api/admin/form/competition", competitionFormAdminRoute);
app.use("/api/auth", authRoute);
app.use("/api/admin/users", userAdminRoute);

/* app.use("/uploads", express.static(path.join(__dirname, "uploads"))); */

/* 捕獲404 */
app.use(function (req: Request, res: Response, next: NextFunction) {
  next(createError(404, "找不到路由"));
});

/* 錯誤處理中間件 */
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.log("錯誤發生：", err);

  //處理zod資料驗證錯誤(直接發出去錯誤訊息)
  if (err instanceof ZodError) {
    res.status(400).json({
      status: "error",
      message: "資料驗證失敗",
      details: err.errors,
    });
    return;
  }

  //MongoDB 錯誤（如唯一鍵衝突）
  if (err.code === 11000 && err.keyPattern?.editToken) {
    res.status(409).json({
      status: "fail",
      message: "系統產生的 editToken 重複，請稍後再試一次",
    });
    return;
  }

  //處理mongoose資料驗證錯誤
  if (err.name === "ValidationError") {
    err.message = "資料欄位未填寫正確，請重新輸入！";
    err.isOperational = true;
  }

  //承接上面的錯誤，發出統一的錯誤格式
  res.status(err.statusCode || err.status || 500).json({
    status: "error",
    message: err.message || "伺服器錯誤",
    statusCode: err.statusCode || 500,
    isOperational: err.isOperational || false,
    error: req.app.get("env") === "development" ? err : {},
  });
});

// 處理未捕捉的 rejection（非同步錯誤）
process.on("unhandledRejection", (reason: any, promise) => {
  console.error("未捕捉的 Rejection：", reason);

  // process.exit(1);
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
