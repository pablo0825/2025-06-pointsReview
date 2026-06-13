// sendReserPasswordEmail.tsX
import nodemailer from "nodemailer";
import { render } from "@react-email/render";
import ResetPasswordEmail from "../emails/ResetPasswordEmail"; // 路徑依專案調整

export const sendResetPasswordEmail = async (
  to: string,
  username: string,
  resetLink: string
) => {
  const emailHtml = await render(
    <ResetPasswordEmail username={username} resetLink={resetLink} />
  );

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
    subject: "重設您的密碼",
    html: emailHtml,
  });
};
