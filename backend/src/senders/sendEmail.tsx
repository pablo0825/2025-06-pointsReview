import nodemailer from "nodemailer";
import { render } from "@react-email/render";

export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  bcc?: string | string[]
) => {
  const emailHtml = await render(html);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"點數審核系統" <${process.env.EMAIL_USER}>`,
    to,
    bcc,
    subject,
    html: emailHtml,
  });
};
