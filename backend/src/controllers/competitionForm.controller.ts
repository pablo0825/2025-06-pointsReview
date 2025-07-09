import { Request, Response } from "express";
import { CompetitionFormDB } from "../models/competitionForm.models";
import { competitionFormSchema } from "../validators/competitionForm.schema";
import { getChangedFields } from "../utils/getChangedFields";
import { AppError } from "../utils/AppError";
import { handleSuccess } from "../utils/handleSuccess";
import crypto from "crypto";
import { queueEmail } from "../tasks/queueEmail";
import { Types } from "mongoose";
import { deleteObsoleteFiles } from "../utils/deleteObsoleteFiles";
import { UserDB } from "../models/user.models";

// 申請人提交新表單
export const submitForm = async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length > 10) {
    throw new AppError(400, "false", "最多上傳 10 個檔案");
  }

  // 儲存檔案 URL 到 DB 中
  const fileUrls = files.map((file) => `/uploads/${file.filename}`);
  const formData = competitionFormSchema.parse(req.body);

  const confirmToken = crypto.randomBytes(32).toString("hex");
  const advisorDbToken = crypto
    .createHash("sha256")
    .update(confirmToken)
    .digest("hex");

  const newForm = await CompetitionFormDB.create({
    ...formData,
    evidenceFiles: fileUrls,
    advisor: {
      ...formData.advisor,
      teacherConfirmToken: advisorDbToken,
      teacherConfirmExpires: new Date(Date.now() + 15 * 60 * 1000),
    },
    history: [
      {
        type: "created",
        timestamp: new Date(),
        user: formData.contact?.name || "user",
        detail: "使用者創建表單",
      },
    ],
  });

  const formId = (newForm._id as Types.ObjectId).toString();
  const teacherName = newForm.advisor.name;
  const teacherEmail = newForm.advisor.email;
  const applicantName = newForm.contact?.name;
  const applicantEmail = newForm.contact?.email;
  const teacherConfirmURL = `${process.env.FRONTEND_URL}/verify-teacher?token=${confirmToken}`;

  await Promise.all([
    queueEmail({
      formId: formId,
      to: teacherEmail,
      subject: "請確認學生競賽申請表單",
      templateName: "TeacherConfirmEmail",
      templateData: {
        username: teacherName,
        teacherConfirmURL,
      },
    }),
    queueEmail({
      formId: formId,
      to: applicantEmail,
      subject: "表單已提交，等待指導老師確認",
      templateName: "ApplicantNotifyEmail",
      templateData: {
        username: applicantName,
        teacherName: teacherName,
      },
    }),
  ]);

  //const editToken = newForm.editToken;
  //不知道這邊會回傳甚麼，到時候可能要限制回傳的資料
  return handleSuccess(res, 201, "true", "新增成功", newForm);
};

// 申請人取得表單連結
export const getFormByToken = async (req: Request, res: Response) => {
  const token = req.params.token;

  const form = await CompetitionFormDB.findOne({ editToken: token }).select(
    "-_id"
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

  form.updatedAt = new Date();
  form.history.push({
    type: "updated",
    timestamp: new Date(),
    user: form.contact?.name || "user",
    detail: "申請人打開表單",
  });

  await form.save();

  // 之前需要調整回傳資料
  return handleSuccess(res, 200, "true", "取得表單", form);
};

// 申請人更新表單內容
export const updatedFormByToKen = async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[]) || [];
  const token = req.params.token;

  const formData = competitionFormSchema.parse(req.body);
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

  // 比對變更欄位
  const original = form.toObject();
  const changedFields = getChangedFields(original, formData);

  // 驗證檔案數量限制
  if (keepFiles.length + files.length > 10) {
    throw new AppError(400, "false", "檔案總數不得超過 10 個");
  }

  // 刪除未保留的檔案
  await deleteObsoleteFiles(form.evidenceFileUrls, keepFiles);

  // 合併檔案清單
  const uploadedFiles = files.map((file) => `/uploads/${file.filename}`);
  form.evidenceFileUrls = [...keepFiles, ...uploadedFiles];

  // 合併資料
  Object.assign(form, formData);

  const user = await UserDB.findOne({ roles: "handle", isDeleted: false });
  if (!user) {
    throw new AppError(500, "false", "找不到承辦人");
  }

  const formId = (form._id as Types.ObjectId).toString();
  const handleName = user.username;
  const handlemail = user.email;

  await queueEmail({
    formId: (form._id as Types.ObjectId).toString(),
    to: handlemail,
    subject: "提醒您，有一筆申請等待您的審查",
    templateName: "ReviewReminderEmail",
    templateData: {
      formId: formId,
      userName: handleName,
      status: "resubmitted",
    },
  });

  form.status = "resubmitted";
  form.updatedAt = new Date();
  form.history.push({
    type: "updated",
    timestamp: new Date(),
    user: formData.contact?.name || "user",
    detail: changedFields.length
      ? `使用者更新了欄位：${changedFields.join(", ")}`
      : "使用者提交了表單但無變更",
  });

  await form.save();

  // 注意回傳的檔案
  return handleSuccess(res, 200, "true", "更新成功", form);
};

// 老師取得連結
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

  if (form.status !== "submitted") {
    throw new AppError(
      400,
      "false",
      "表單狀態不允許此操作，連結可能已失效或使用過。"
    );
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

// 老師確認是否同意申請
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

  if (form.status !== "submitted") {
    throw new AppError(
      400,
      "false",
      "表單狀態不允許此操作，連結可能已失效或使用過。"
    );
  }

  if (typeof form.advisor.isAgreed === "boolean") {
    throw new AppError(400, "false", "此連結已使用過，無法重複提交");
  }

  const user = await UserDB.findOne({ roles: "handle", isDeleted: false });
  if (!user) {
    throw new AppError(500, "false", "找不到承辦人");
  }

  const formId = (form._id as Types.ObjectId).toString();
  const formStatu = form.status;
  const contactName = form.contact.name;
  const contactEmail = form.contact.email;
  const advisorName = form.advisor.name;
  const projectTitle = form.name;
  const handleName = user.username;
  const handlemail = user.email;

  if (agreed) {
    await Promise.all([
      queueEmail({
        formId: formId,
        to: contactEmail,
        subject: "指導老師已同意競賽申請表單",
        templateName: "TeacherAgreesEmail",
        templateData: {
          contactName: contactName,
          advisorName: advisorName,
          projectTitle: projectTitle,
        },
      }),
      queueEmail({
        formId: formId,
        to: handlemail,
        subject: "提醒您，有一筆申請等待您的審查",
        templateName: "ReviewReminderEmail",
        templateData: {
          formId: formId,
          userName: handleName,
          status: formStatu,
        },
      }),
    ]);
  } else {
    form.status = "rejected";
    await queueEmail({
      formId: formId,
      to: contactEmail,
      subject: "指導老師已拒絕競賽申請表單",
      templateName: "TeacherRejectEmail",
      templateData: {
        contactName: contactName,
        advisorName: advisorName,
        projectTitle: projectTitle,
      },
    });
  }

  form.advisor.isAgreed = agreed;
  form.advisor.teacherConfirmExpires = undefined;
  form.advisor.teacherConfirmToken = undefined;
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
