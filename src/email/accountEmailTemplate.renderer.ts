import { z } from "zod";

import type {
  EmailTemplateName,
  EmailTemplateRenderer,
  RenderedEmail,
} from "./emailTemplate";

const accountEmailPayloadSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  expiresAt: z.string().datetime({ offset: true }),
});

const activationPayloadSchema = accountEmailPayloadSchema.extend({
  activationUrl: z.string().url(),
});

const passwordResetPayloadSchema = accountEmailPayloadSchema.extend({
  resetUrl: z.string().url(),
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

function renderActionEmail(input: {
  subject: string;
  displayName: string;
  introduction: string;
  actionLabel: string;
  actionUrl: string;
  expiresAt: string;
}): RenderedEmail {
  const displayName = escapeHtml(input.displayName);
  const actionUrl = escapeHtml(input.actionUrl);
  const expiresAt = escapeHtml(input.expiresAt);

  return {
    subject: input.subject,
    html: `<p>${displayName} 您好：</p><p>${input.introduction}</p><p><a href="${actionUrl}">${input.actionLabel}</a></p><p>連結到期時間：${expiresAt}</p>`,
    text: `${input.displayName} 您好：\n\n${input.introduction}\n${input.actionUrl}\n\n連結到期時間：${input.expiresAt}`,
  };
}

export class AccountEmailTemplateRenderer implements EmailTemplateRenderer {
  async render(
    templateName: EmailTemplateName,
    payload: Record<string, unknown>,
  ): Promise<RenderedEmail> {
    if (templateName === "account_activation") {
      const parsed = activationPayloadSchema.parse(payload);
      return renderActionEmail({
        subject: "請啟用您的點數審核系統帳號",
        displayName: parsed.displayName,
        introduction: "請使用以下連結設定密碼並完成帳號啟用。",
        actionLabel: "啟用帳號",
        actionUrl: parsed.activationUrl,
        expiresAt: parsed.expiresAt,
      });
    }

    if (templateName === "password_reset") {
      const parsed = passwordResetPayloadSchema.parse(payload);
      return renderActionEmail({
        subject: "重設您的點數審核系統密碼",
        displayName: parsed.displayName,
        introduction: "請使用以下連結設定新的帳號密碼。",
        actionLabel: "重設密碼",
        actionUrl: parsed.resetUrl,
        expiresAt: parsed.expiresAt,
      });
    }

    throw new Error(`Unsupported account email template: ${templateName}`);
  }
}

