import type { Request, Response } from "express";

import { AuthService } from "../services/auth.service";
import { AccountActivationService } from "../services/accountActivation.service";
import { PasswordResetService } from "../services/passwordReset.service";
import { getClientIp } from "../utils/clientIp";

function getRequiredRequestIp(req: Request): string {
  return getClientIp(req) ?? "0.0.0.0";
}

function getRequiredUserAgent(req: Request): string {
  return req.get("user-agent") ?? "unknown";
}

function requireAuth(req: Request): NonNullable<Request["auth"]> {
  if (!req.auth) {
    throw new Error("Authenticated route reached without req.auth");
  }

  return req.auth;
}

export async function login(req: Request, res: Response): Promise<void> {
  const user = await AuthService.login(
    {
      email: req.body.email,
      password: req.body.password,
      ipAddress: getRequiredRequestIp(req),
      userAgent: getRequiredUserAgent(req),
    },
    res,
  );

  res.status(200).json({ data: { user } });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);

  await AuthService.logout(auth.sessionId, res);

  res.status(200).json({ data: { ok: true } });
}

export async function me(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);

  res.status(200).json({
    data: {
      user: AuthService.getCurrentUser(auth.user),
    },
  });
}

export async function getCsrfToken(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const csrfToken = await AuthService.rotateCsrfToken(auth.sessionId);

  res.status(200).json({ data: { csrfToken } });
}

export async function activateAccount(
  req: Request,
  res: Response,
): Promise<void> {
  await AccountActivationService.activate(
    String(req.params.token),
    req.body.password,
    {
      ipAddress: getRequiredRequestIp(req),
      userAgent: getRequiredUserAgent(req),
    },
  );
  res.status(200).json({ data: { ok: true } });
}

export async function requestPasswordReset(
  req: Request,
  res: Response,
): Promise<void> {
  await PasswordResetService.requestReset(req.body.email);
  res.status(200).json({ data: { ok: true } });
}

export async function resetPassword(
  req: Request,
  res: Response,
): Promise<void> {
  await PasswordResetService.resetPassword(
    String(req.params.token),
    req.body.password,
    {
      ipAddress: getRequiredRequestIp(req),
      userAgent: getRequiredUserAgent(req),
    },
  );
  res.status(200).json({ data: { ok: true } });
}
