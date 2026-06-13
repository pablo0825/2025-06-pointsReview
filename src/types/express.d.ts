//express.d.ts
import { Request } from "express";
import { JwtPayload } from "jsonwebtoken";

interface CustomUserPayload extends JwtPayload {
  id: string;
  email: string;
  role?: string;
}

// 使用 declare global 和 namespace Express 來擴展 Request 介面
declare global {
  namespace Express {
    interface Request {
      user?: CustomUserPayload;
    }
  }
}
