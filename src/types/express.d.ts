//express.d.ts
import { Request } from "express";

import type { Role } from "../auth/permissions";

interface CustomUserPayload {
  id: string;
  name?: string;
  username?: string;
  displayName?: string;
  email: string;
  role?: string;
  roles?: string[];
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
