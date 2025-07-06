// sendTeacherConfirmEmail.tsX
import nodemailer from "nodemailer";
import { render } from "@react-email/render";
import TeacherConfirmEmail from "../emails/TeacherConfirmEmail";

export const sendTeacherConfirmEmail = async (
  to: string,
  username: string,
  teacherConfirmURL: string
) => {
  const emailHtml = await render(
    <TeacherConfirmEmail
      username={username}
      teacherConfirmURL={teacherConfirmURL}
    />
  );

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"競賽系統" <${process.env.EMAIL_USER}>`,
    to,
    subject: "請確認學生競賽申請表單",
    html: emailHtml,
  });
};
