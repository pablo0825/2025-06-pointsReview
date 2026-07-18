export const emailTemplateNames = [
  "account_activation",
  "password_reset",
  "admin_recovery",
  "advisor_sign_request",
  "advisor_sign_reminder_1",
  "advisor_sign_reminder_2",
  "advisor_sign_reminder_3",
  "advisor_confirmation_expired",
  "revision_request",
  "revision_extended",
  "revision_reminder",
  "revision_expired",
  "application_approved",
  "application_rejected",
  "email_delivery_failed",
] as const;

export type EmailTemplateName = (typeof emailTemplateNames)[number];

export interface RenderedEmail {
  subject: string;
  html: string;
  text?: string;
}

export interface EmailTemplateRenderer {
  render(
    templateName: EmailTemplateName,
    payload: Record<string, unknown>,
  ): Promise<RenderedEmail>;
}
