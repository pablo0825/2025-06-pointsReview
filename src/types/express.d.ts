//express.d.ts
import { Request } from "express";
import { JwtPayload } from "jsonwebtoken";

import type { Role } from "../auth/permissions";

interface CustomUserPayload extends JwtPayload {
  id: string;
  email: string;
  role?: string;
}

interface AuthenticatedRequestContext {
  sessionId: string;
  csrfTokenHash: Buffer;
  user: {
    id: string;
    displayName: string;
    email: string;
    role: Role;
  };
}

// 使用 declare global 和 namespace Express 來擴展 Request 介面
declare global {
  namespace Express {
    interface Request {
      user?: CustomUserPayload;
      auth?: AuthenticatedRequestContext;
    }
  }
}
