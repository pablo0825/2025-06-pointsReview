// sendTeacherConfirmEmail.tsX
import nodemailer from "nodemailer";
import { render } from "@react-email/render";
import TeacherConfirmEmail from "../emails/TeacherConfirmEmail";
import ApplicantNotifyEmail from "../emails/ApplicantNotifyEmail";

export const sendApplicantNotifyEmail = async (
  to: string,
  username: string,
  teacherName: string
) => {
  const emailHtml = await render(
    <ApplicantNotifyEmail username={username} teacherName={teacherName} />
  );

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"點數審核系統" <${process.env.EMAIL_USER}>`,
    to,
    subject: "表單已提交，等待指導老師確認",
    html: emailHtml,
  });
};
