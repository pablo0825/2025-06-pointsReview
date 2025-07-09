import { sendEmail } from "../senders/sendEmail";
import { EmailTaskDB } from "../models/emailTask.model";
import { renderEmailTemplate } from "../utils/renderEmailTemplate";

export const queueEmail = async ({
  formId,
  to,
  subject,
  templateName,
  templateData,
}: {
  formId: string;
  to: string;
  subject: string;
  templateName: string;
  templateData: any;
}) => {
  try {
    const html = await renderEmailTemplate(templateName, templateData);

    await sendEmail(to, subject, html);
  } catch (err) {
    console.error(`發送 ${templateName} 失敗，轉存 queue`, err);
    await EmailTaskDB.create({
      formId,
      to,
      subject,
      templateName,
      templateData,
    });
  }
};
