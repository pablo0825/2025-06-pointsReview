import { randomUUID } from "node:crypto";

import {
  generateAccountToken,
  getActivationTokenExpiresAt,
  getPasswordResetTokenExpiresAt,
  hashAccountToken,
} from "../auth/accountToken";
import { getRequiredEnv } from "../config/env";
import type { DatabaseClient } from "../db/types";
import { UserRepository } from "../repositories/user.repository";
import { EmailTaskService } from "./emailTask.service";

interface AccountEmailUser {
  id: string;
  displayName: string;
  email: string;
}

function createFrontendUrl(path: string): string {
  const frontendUrl = getRequiredEnv("FRONTEND_URL");
  return new URL(path, `${frontendUrl.replace(/\/$/, "")}/`).toString();
}

export async function createActivationTask(
  client: DatabaseClient,
  user: AccountEmailUser,
  now = new Date(),
): Promise<void> {
  const token = generateAccountToken();
  const expiresAt = getActivationTokenExpiresAt(now);

  await UserRepository.setActivationToken(
    client,
    user.id,
    hashAccountToken(token),
    expiresAt,
  );
  await EmailTaskService.createPendingTask(client, {
    eventKey: `account-activation:user-${user.id}:${randomUUID()}`,
    recipientEmail: user.email,
    templateName: "account_activation",
    payload: {
      displayName: user.displayName,
      activationUrl: createFrontendUrl(
        `/auth/activation/${encodeURIComponent(token)}`,
      ),
      expiresAt: expiresAt.toISOString(),
    },
    scheduledAt: now,
  });
}

export async function createPasswordResetTask(
  client: DatabaseClient,
  user: AccountEmailUser,
  now = new Date(),
): Promise<void> {
  const token = generateAccountToken();
  const expiresAt = getPasswordResetTokenExpiresAt(now);

  await UserRepository.setPasswordResetToken(
    client,
    user.id,
    hashAccountToken(token),
    expiresAt,
  );
  await EmailTaskService.createPendingTask(client, {
    eventKey: `password-reset:user-${user.id}:${randomUUID()}`,
    recipientEmail: user.email,
    templateName: "password_reset",
    payload: {
      displayName: user.displayName,
      resetUrl: createFrontendUrl(
        `/auth/password-reset/${encodeURIComponent(token)}`,
      ),
      expiresAt: expiresAt.toISOString(),
    },
    scheduledAt: now,
  });
}

export const AccountEmailTaskService = {
  createActivationTask,
  createPasswordResetTask,
};

