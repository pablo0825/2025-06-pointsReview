import { Request, Response } from "express";
import { CompetitionFormDB } from "../models/competitionForm.models";
import { competitionFormSchema } from "../validators/competitionForm.schema";
import { getChangedFields } from "../utils/getChangedFields";
import { AppError } from "../utils/AppError";
import { handleSuccess } from "../utils/handleSuccess";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { sendTeacherConfirmEmail } from "../senders/sendTeacherConfirmEmail";
import { sendApplicantNotifyEmail } from "../senders/sendApplicantNotifyEmail";

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
    await sendTeacherConfirmEmail(teacherEmail, teacherName, teacherConfirmURL);
  } catch (err) {
    console.error("發送指導老師同意信失敗", err);

    throw new AppError(500, "false", "郵件發送失敗，請稍後再試。");
  }

  const applicantName = newForm.contact?.name;
  const applicantEmail = newForm.contact?.email;

  if (!applicantName || !applicantEmail) {
    throw new AppError(500, "false", "申請人資料不完整");
  }

  try {
    await sendApplicantNotifyEmail(applicantEmail, applicantName, teacherName);
  } catch (err) {
    console.error("發送申請人通知信失敗", err);

    throw new AppError(500, "false", "郵件發送失敗，請稍後再試。");
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
    throw new AppError(404, "false", "找不到 editToken 對應的表單");
  }

  if (form.status !== "needs_revision") {
    throw new AppError(403, "false", "表單不在編輯狀態");
  }

  const now = new Date();
  if (now > form.expirationDate) {
    throw new AppError(403, "false", "編輯連結已過期");
  }

  if (form.isLocked === true) {
    throw new AppError(403, "false", "表單已鎖定");
  }

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
    throw new AppError(404, "false", "找不到 editToken 對應的表單");
  }

  if (form.status !== "needs_revision") {
    throw new AppError(403, "false", "表單不在編輯狀態");
  }

  const now = new Date();
  if (now > form.expirationDate) {
    throw new AppError(403, "false", "編輯連結已過期");
  }

  if (form.isLocked === true) {
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
    const filePath = path.join(__dirname, "../storage", fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath); // 從硬碟刪除
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
