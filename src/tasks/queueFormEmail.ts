import { sendEmail } from "../senders/sendEmail";
import { EmailTaskDB } from "../models/emailTask.model";
import { renderEmailTemplate } from "../utils/renderEmailTemplate";

export const queueFormEmail = async ({
  formId,
  to,
  subject,
  templateName,
  templateData,
  bcc,
}: {
  formId: string;
  to: string;
  subject: string;
  templateName: string;
  templateData: any;
  bcc?: string | string[];
}) => {
  try {
    const html = await renderEmailTemplate(templateName, templateData);

    await sendEmail(to, subject, html, bcc);
  } catch (err) {
    console.error(`發送 ${templateName} 失敗，轉存 queue`, err);
    await EmailTaskDB.create({
      formId,
      to,
      subject,
      templateName,
      templateData,
      bcc,
    });
  }
};
