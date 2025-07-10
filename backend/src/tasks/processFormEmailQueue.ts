import nodemailer from "nodemailer";
import { EmailTaskDB } from "../models/emailTask.model";
import { renderEmailTemplate } from "../utils/renderEmailTemplate";
import { CompetitionFormDB } from "../models/competitionForm.models";

let transporter: nodemailer.Transporter | null = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    transporter.verify(function (error, success) {
      if (error) {
        console.error("Nodemailer 連接驗證失敗:", error);
      } else {
        console.log("Nodemailer 服務器已準備好接收消息。");
      }
    });
  }
  return transporter;
};

export const processFormEmailQueue = async () => {
  const pendingTasks = await EmailTaskDB.find({ status: "pending" }).limit(10);
  const activeTransporter = getTransporter();

  for (const task of pendingTasks) {
    try {
      const html = await renderEmailTemplate(
        task.templateName,
        task.templateData
      );

      await activeTransporter.sendMail({
        from: `"競賽系統" <${process.env.EMAIL_USER}>`,
        to: task.to,
        subject: task.subject,
        html,
      });

      task.sentAt = new Date();
      task.status = "sent";

      console.log(`[EmailQueue] 寄送成功：${task.subject} 給 ${task.to}`);

      await task.save();
    } catch (err) {
      if (task.retries < task.maxRetries) task.retries += 1;

      if (err instanceof Error) {
        task.error = err.message;
      } else {
        task.error = "未知錯誤";
      }

      if (task.retries >= task.maxRetries) {
        task.status = "failed";

        console.warn(
          `[EmailQueue] 寄送失敗 (${task.retries}/${task.maxRetries})：${task.subject} 給 ${task.to}`
        );

        await CompetitionFormDB.findByIdAndUpdate(task.formId, {
          status: "reserved",
        });
      }
    }
    await task.save();
  }
};
