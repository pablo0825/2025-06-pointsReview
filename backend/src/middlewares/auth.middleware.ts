// auth.middleware.ts
import jwt, { SignOptions } from "jsonwebtoken";
import { AppError } from "../utils/AppError";
import { Request, Response, NextFunction } from "express";

interface UserPayload {
  id: string;
  name: string;
  email: string;
  role?: string;
}

export class AuthMiddleware {
  static generateAccessToken(
    arg0: { id: unknown; name: string; email: string; roles: string },
    arg1: string
  ) {
    throw new Error("Method not implemented.");
  }
  static generateRefreshToken(arg0: { id: unknown }, arg1: string) {
    throw new Error("Method not implemented.");
  }
  private JWT_ACCESS_SECRET: string;
  private JWT_REFRESH_SECRET: string;

  constructor() {
    const secret1 = process.env.JWT_ACCESS_SECRET;
    const secret2 = process.env.JWT_REFRESH_SECRET;
    if (!secret1) {
      throw new AppError(
        500,
        "false",
        "JWT_ACCESS_SECRET is not defined in environment variables."
      );
    }
    if (!secret2) {
      throw new AppError(
        500,
        "false",
        "JWT_REFRESH_SECRET is not defined in environment variables."
      );
    }
    this.JWT_ACCESS_SECRET = secret1;
    this.JWT_REFRESH_SECRET = secret2;
  }

  //userPayload是資料包，裡面有user_id, user_name, user_email, user_rold et al data

  //產生訪問token
  generateAccessToken(userPayload: UserPayload, expiresIn: string = "15m") {
    const options: SignOptions = {
      expiresIn: expiresIn as SignOptions["expiresIn"],
    };

    return jwt.sign(userPayload, this.JWT_ACCESS_SECRET, options);
  }

  //產生刷新token
  generateRefreshToken(userPayload: UserPayload, expiresIn: string = "7d") {
    const options: SignOptions = {
      expiresIn: expiresIn as SignOptions["expiresIn"],
    };

    return jwt.sign({ id: userPayload.id }, this.JWT_REFRESH_SECRET, options);
  }

  //驗證token
  //xhr可以經由特定的URL摘取資料，但不用刷新整個頁面
  async authenticateToken(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers["authorization"];
    const accessToken = authHeader && authHeader.split(" ")[1];

    if (!accessToken) {
      //如果是 AJAX 請求，或前端請求 JSON 回應
      if (
        req.xhr ||
        (req.headers.accept && req.headers.accept.includes("application/json"))
      ) {
        throw new AppError(401, "false", "未提供AccessToken，請重新登入。");
      }

      return res.redirect(
        `/login?redirectTo=${encodeURIComponent(req.originalUrl)}`
      );
    }

    try {
      const decodedUser = jwt.verify(
        accessToken,
        this.JWT_ACCESS_SECRET
      ) as UserPayload;
      req.user = decodedUser;

      await next();
    } catch (err: any) {
      console.error("Access Token authentication error:", err.message);

      if (
        req.xhr ||
        (req.headers.accept && req.headers.accept.includes("application/json"))
      ) {
        throw new AppError(
          401,
          "false",
          "AccessToken無效或已過期，請嘗試刷新Token。"
        );
      }

      return res.redirect(
        `/login?redirectTo=${encodeURIComponent(req.originalUrl)}`
      );
    }
  }

  //權限審核
  hasPermission(requiredRoles: string[]) {
    const rolesToCheck = Array.isArray(requiredRoles)
      ? requiredRoles
      : [requiredRoles];

    return async (req: Request, res: Response, next: NextFunction) => {
      if (!req.user || !req.user.roles) {
        console.warn(
          "hasPermission called without req.user. This implies authenticateToken was not run or failed."
        );
        throw new AppError(
          500,
          "false",
          "伺服器內部錯誤：無法獲取使用者角色資訊。"
        );
      }

      const userRoles = req.user.roles || [];
      const hasAnyRequiredRole = rolesToCheck.some((role) =>
        userRoles.includes(role)
      );

      if (!hasAnyRequiredRole) {
        if (
          req.xhr ||
          (req.headers.accept &&
            req.headers.accept.includes("application/json"))
        ) {
          throw new AppError(
            403,
            "false",
            "抱歉，您沒有足夠的權限訪問此資源。"
          );
        }

        return res.status(403).send("抱歉，您沒有足夠的權限訪問此資源。");
      }

      await next();
    };
  }
}

//實例化 (在這邊做一次就好，直接都是引用)
module.exports = new AuthMiddleware();
