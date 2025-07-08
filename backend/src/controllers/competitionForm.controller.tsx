import { Request, Response } from "express";
import { CompetitionFormDB } from "../models/competitionForm.models";
import { competitionFormSchema } from "../validators/competitionForm.schema";
import { getChangedFields } from "../utils/getChangedFields";
import { AppError } from "../utils/AppError";
import { handleSuccess } from "../utils/handleSuccess";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { EmailTaskDB } from "../models/emailTask.model";
import { sendEmail } from "../senders/sendEmail";
import TeacherConfirmEmail from "../emails/TeacherConfirmEmail";
import ApplicantNotifyEmail from "../emails/ApplicantNotifyEmail";

//提交新表單
export const submitForm = async (
  req: Request,
  res: Response
): Promise<void> => {
  const files = (req.files as Express.Multer.File[]) || [];

  if (files.length > 10) {
    throw new AppError(400, "false", "最多上傳 10 個檔案");
  }

  // 儲存檔案 URL 到 DB 中
  const fileUrls = files.map((file) => `/uploads/${file.filename}`);

  const validateFormData = competitionFormSchema.parse(req.body);

  const newForm = await CompetitionFormDB.create({
    ...validateFormData,
    evidenceFiles: fileUrls,
    history: [
      {
        type: "created",
        timestamp: new Date(),
        user: validateFormData.contact?.name || "user",
        detail: "使用者創建表單",
      },
    ],
  });

  const teacherName = newForm.advisor.name;
  const teacherEmail = newForm.advisor.email;
  if (!teacherName || !teacherEmail) {
    throw new AppError(500, "false", "指導老師的姓名和email未載入");
  }

  const confirmToken = crypto.randomBytes(32).toString("hex");
  const advisorDbToken = crypto
    .createHash("sha256")
    .update(confirmToken)
    .digest("hex");

  newForm.advisor.teacherConfirmToken = advisorDbToken;
  newForm.advisor.teacherConfirmExpires = new Date(Date.now() + 15 * 60 * 1000);

  const teacherConfirmURL = `${process.env.FRONTEND_URL}/verify-teacher?token=${confirmToken}`;

  try {
    await sendEmail(
      teacherEmail,
      "請確認學生競賽申請表單",
      <TeacherConfirmEmail
        username={teacherName}
        teacherConfirmURL={teacherConfirmURL}
      />
    );
  } catch (err) {
    console.error("發送指導老師同意信失敗", err);

    await EmailTaskDB.create({
      formId: newForm._id,
      to: teacherEmail,
      subject: "請確認學生競賽申請表單",
      templateName: "TeacherConfirmEmail",
      templateData: {
        username: teacherName,
        teacherConfirmURL: teacherConfirmURL,
      },
    });

    /* throw new AppError(500, "false", "郵件發送失敗，請稍後再試。"); */
  }

  const applicantName = newForm.contact?.name;
  const applicantEmail = newForm.contact?.email;

  if (!applicantName || !applicantEmail) {
    throw new AppError(500, "false", "申請人資料不完整");
  }

  try {
    await sendEmail(
      applicantEmail,
      "表單已提交，等待指導老師確認",
      <ApplicantNotifyEmail
        username={applicantName}
        teacherName={teacherName}
      />
    );
  } catch (err) {
    console.error("發送申請人通知信失敗", err);

    await EmailTaskDB.create({
      formId: newForm._id,
      to: applicantEmail,
      subject: "表單已提交，等待指導老師確認",
      templateName: "ApplicantNotifyEmail",
      templateData: {
        username: applicantName,
        teacherName: teacherName,
      },
    });

    /*  throw new AppError(500, "false", "郵件發送失敗，請稍後再試。"); */
  }

  await newForm.save();

  //const editToken = newForm.editToken;
  //不知道這邊會回傳甚麼，到時候可能要限制回傳的資料
  return handleSuccess(res, 201, "true", "新增成功", newForm);
};

//根據 editToKen 取得表單
export const getFormByToken = async (req: Request, res: Response) => {
  const token = req.params.token;

  const form = await CompetitionFormDB.findOne({ editToken: token }).select(
    "-_id -history"
  );

  if (!form) {
    console.warn(`嘗試使用無效的token存取表單：${token}`);
    throw new AppError(404, "false", "找不到 editToken 對應的表單");
  }

  if (form.status !== "needs_revision") {
    throw new AppError(403, "false", "表單不在編輯狀態");
  }

  const now = new Date();
  if (now > form.expirationDate) {
    throw new AppError(403, "false", "編輯連結已過期");
  }

  if (form.isLocked) {
    throw new AppError(403, "false", "表單已鎖定");
  }

  /* if (form.advisor.isAgreed !== true) {
    throw new AppError(403, "false", "表單尚未取得指導老師同意");
  }
 */

  return handleSuccess(res, 200, "true", "取得表單", form);
};

//根據 editToKen 更新表單
export const updatedFormByToKen = async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[]) || [];
  const token = req.params.token;

  const validateFormData = competitionFormSchema.parse(req.body);
  const keepFiles: string[] = req.body.keepFiles
    ? JSON.parse(req.body.keepFiles)
    : [];

  const form = await CompetitionFormDB.findOne({ editToken: token });

  if (!form) {
    console.warn(`嘗試使用無效的token存取表單：${token}`);
    throw new AppError(404, "false", "找不到 editToken 對應的表單");
  }

  if (form.status !== "needs_revision") {
    throw new AppError(403, "false", "表單不在編輯狀態");
  }

  const now = new Date();
  if (now > form.expirationDate) {
    throw new AppError(403, "false", "編輯連結已過期");
  }

  if (form.isLocked) {
    throw new AppError(403, "false", "表單已鎖定");
  }

  //把mongode document轉換成json儲存起來
  const original = form.toObject();
  const changedFields = getChangedFields(original, validateFormData);

  //刪除未保留的檔案
  const deletedFiles = form.evidenceFileUrls.filter(
    (url) => !keepFiles.includes(url)
  );
  for (const fileUrl of deletedFiles) {
    //const filePath = path.join(__dirname, "../storage", fileUrl);

    if (!fileUrl.startsWith("/uploads/")) {
      console.warn(`嘗試刪除非預期格式的檔案URL: ${fileUrl}`);
      continue; // 跳過不安全的URL
    }

    const actualFilePath = path.join(
      process.cwd(),
      "storage",
      fileUrl.replace("/uploads/", "")
    );

    if (fs.existsSync(actualFilePath)) {
      try {
        fs.unlinkSync(actualFilePath);
        console.log(`已刪除檔案: ${actualFilePath}`);
      } catch (err) {
        console.error(`刪除檔案失敗: ${actualFilePath}`, err);
      }
    } else {
      console.warn(`嘗試刪除不存在的檔案: ${actualFilePath}`);
    }
  }

  //處理新檔案
  const uploadedFiles = files.map((file) => `/uploads/${file.filename}`);
  form.evidenceFileUrls = [...keepFiles, ...uploadedFiles];

  //把validateDate合併到form裡面
  Object.assign(form, validateFormData);

  //form status變為"resubmitted"
  //更新時間
  //更新歷史紀錄
  form.status = "resubmitted";
  form.updatedAt = new Date();
  form.history.push({
    type: "updated",
    timestamp: new Date(),
    user: validateFormData.contact?.name || "user",
    detail: changedFields.length
      ? `使用者更新了欄位：${changedFields.join(", ")}`
      : "使用者提交了表單但無變更",
  });

  await form.save();

  return handleSuccess(res, 200, "true", "更新成功", form);
};

export const verifyAdvisorToken = async (req: Request, res: Response) => {
  const token = req.params.token;
  if (!token) {
    throw new AppError(404, "false", "找不到 token ");
  }

  const hashedTokenFromRequest = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const form = await CompetitionFormDB.findOne({
    "advisor.teacherConfirmToken": hashedTokenFromRequest,
    "advisor.teacherConfirmExpires": { $gt: Date.now() },
  });

  if (!form) {
    console.warn(`嘗試使用無效的token存取表單：${token}`);
    throw new AppError(404, "false", "找不到表單");
  }

  form.history.push({
    type: "updated",
    timestamp: new Date(),
    user: form.advisor.name || "advisor",
    detail: `${form.advisor.name} 老師打開了 ${form._id} 表單`,
  });

  await form.save();

  return handleSuccess(res, 200, "true", "取得token", form);
};

export const advisorConfirmedByToken = async (req: Request, res: Response) => {
  const { token } = req.params;
  if (!token) {
    throw new AppError(404, "false", "找不到 token");
  }

  const { agreed } = req.body;
  if (typeof agreed !== "boolean") {
    throw new AppError(400, "false", "缺少或錯誤的 agreed 參數");
  }

  const hashedTokenFromRequest = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const form = await CompetitionFormDB.findOne({
    "advisor.teacherConfirmToken": hashedTokenFromRequest,
    "advisor.teacherConfirmExpires": { $gt: Date.now() },
  });

  if (!form) {
    console.warn(`嘗試使用無效的token存取表單：${token}`);
    throw new AppError(404, "false", "找不到表單");
  }

  if (typeof form.advisor.isAgreed === "boolean") {
    throw new AppError(400, "false", "此連結已使用過，無法重複提交");
  }

  if (agreed === true) {
    //寄信通知承辦人和申請人
  } else {
    form.status = "rejected";
    //寄信通知申請人，指導老師拒絕
  }

  form.advisor.isAgreed = agreed;
  form.history.push({
    type: "updated",
    timestamp: new Date(),
    user: form.advisor.name || "advisor",
    detail: `${form.advisor.name} 老師${
      agreed ? "同意" : "不同意"
    } ${form._id} 表單申請`,
  });

  await form.save();

  return handleSuccess(res, 200, "true", "同意表單申請", form);
};
