//competitionFrom.admin.controllers
import { Request, Response } from "express";
import { CompetitionFormDB } from "../models/competitionForm.models";
import {
  reviseNoteSchema,
  rejectedReasonSchema,
} from "../validators/competitionForm.schema";
import mongoose from "mongoose";
import { AppError } from "../utils/AppError";
import { handleSuccess } from "../utils/handleSuccess";
import fs from "fs";
import path from "path";
import { queueFormEmail } from "../tasks/queueFormEmail";
import { Types } from "mongoose";
import { UserDB } from "../models/user.models";
import crypto from "crypto";
import { pointsTableDB } from "../models/pointsTable.models";
import { number } from "zod";
import { use } from "react";
import { PointsTaskDB } from "../models/pointsTask.models";

// 查詢所有表單
export const getAllFormData = async (req: Request, res: Response) => {
  const filter: any = {};

  // 等之後要做指定查詢，在來處理這個部分
  /* if (req.query.status) {
      filter.status = req.query.status;
    } */

  const forms = await CompetitionFormDB.find(filter)
    .sort({ _id: -1 })
    .select("name date level award status contact.name");

  if (forms.length === 0) {
    throw new AppError(404, "false", "目前尚無任何表單資料");
  }

  return handleSuccess(res, 200, "true", "查詢成功", { forms }, forms.length);
};

// 查詢指定表單
export const getFormById = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, "false", "ID 格式錯誤");
  }

  const form = await CompetitionFormDB.findById(id);

  if (!form) {
    throw new AppError(404, "false", "找不到表單資料");
  }

  return handleSuccess(res, 200, "true", `查詢 ${form._id} 成功`, form);
};

// 把form status設定為補件
export const reviseFormById = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, "false", "ID 格式錯誤");
  }

  const { revisionNote } = reviseNoteSchema.parse(req.body);

  const form = await CompetitionFormDB.findById(id);
  if (!form) {
    throw new AppError(404, "false", "找不到表單資料");
  }

  if (!form.advisor.isAgreed) {
    throw new AppError(400, "false", "表單尚未取得指導老師同意，無法編輯");
  }

  if (form.isLocked) {
    throw new AppError(403, "false", "表單已鎖定");
  }

  if (!["resubmitted", "submitted"].includes(form.status)) {
    throw new AppError(400, "false", "目前表單狀態不可設定為補件");
  }

  const formId = (form._id as Types.ObjectId).toString();
  const handleName = req.user?.name;
  const handlEmail = req.user?.email;
  const contactName = form.contact.name;
  const contactEmail = form.contact.email;
  const formStatus = "needs_revision";
  const contestName = form.name;
  const editToken = form.editToken;

  const studentEditURL = `${process.env.FRONTEND_URL}/edit/${editToken}`;

  await queueFormEmail({
    formId: formId,
    to: contactEmail,
    subject: `${contestName} 點數申請退件通知`,
    templateName: "FormRevisionEmail",
    templateData: {
      projectTitle: contestName,
      contactName: contactName,
      revisionNote: revisionNote,
      url: studentEditURL,
      handlEmail: handlEmail,
    },
  });

  form.revisionNote = revisionNote;
  form.expirationDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  form.status = formStatus;
  form.updatedAt = new Date();
  form.history.push({
    type: "status_changed",
    timestamp: new Date(),
    user: handleName || "未知承辦人",
    detail: `退件原因：${revisionNote}`,
  });

  await form.save();

  return handleSuccess(res, 200, "true", "表單設定為補件", form);
};

// form review approve
export const approveFormById = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, "false", "ID 格式錯誤");
  }

  const form = await CompetitionFormDB.findById(id);
  if (!form) {
    throw new AppError(404, "false", "找不到表單資料");
  }

  if (!form.advisor.isAgreed) {
    throw new AppError(400, "false", "表單尚未取得指導老師同意，無法編輯");
  }

  if (form.isLocked) {
    throw new AppError(403, "false", "表單已鎖定");
  }

  if (!["resubmitted", "submitted"].includes(form.status)) {
    throw new AppError(400, "false", "目前表單狀態不可設定為核准");
  }

  if (form.status === "approved") {
    throw new AppError(400, "false", "表單已核准，無需重複核准");
  }

  const director = await UserDB.findOne({
    roles: "director",
    isDeleted: false,
  });
  if (!director) {
    throw new AppError(404, "false", "找不到主管");
  }

  const formId = (form._id as Types.ObjectId).toString();
  const handleName = req.user?.name;
  const handleEmail = req.user?.email;
  const contactName = form.contact.name;
  const contactEmail = form.contact.email;
  const formStatus = "approved";
  const contestLevel = form.level;
  const contestName = form.name;
  const contestGroup = form.group;
  const contestAward = form.award;
  const totalPoints = form.totalPoints;
  const teacherName = form.advisor.name;
  const students = form.students;
  const directorEmail = director.email;

  if (!handleEmail) {
    throw new AppError(403, "false", "無法取得使用者 email");
  }

  await Promise.allSettled(
    students.map(async (student) => {
      const { studentId, pointSubmitted: points, name } = student;
      try {
        const user = await pointsTableDB.findOne({
          studentId,
          isLocked: false,
        });
        if (!user) {
          console.log(`找不到學生 ${studentId}`);
          return;
        }

        const current =
          typeof user.group?.contest === "number" ? user.group.contest : 0;
        const updated = current + points;

        user.group = { ...user.group, contest: updated };
        user.history.push({
          type: "status_changed",
          timestamp: new Date(),
          user: user.name || "未知學生",
          detail: `原點數：${current}，新點數：${updated}`,
        });

        await user.save();
      } catch (err) {
        console.error(`處理學生 ${studentId} 錯誤:`, err);
        await PointsTaskDB.create({
          formId,
          studentId,
          name,
          points,
          err: String(err) || "未知錯誤",
        });
      }
    })
  );

  await queueFormEmail({
    formId: formId,
    to: contactEmail,
    subject: `${contestName} 點數申請「核准」通知`,
    templateName: "FormApprovedEmail",
    templateData: {
      level: contestLevel,
      contestName: contestName,
      contestGroup: contestGroup,
      contestAward: contestAward,
      totalPoints: totalPoints,
      teacherName: teacherName,
      students: students,
      contactName: contactName,
    },
    bcc: [directorEmail, handleEmail],
  });

  form.editToken = "";
  form.revisionNote = undefined;
  form.rejectedReason = undefined;
  form.isLocked = true;
  form.status = formStatus;
  form.history.push({
    type: "status_changed",
    timestamp: new Date(),
    user: handleName || "未知承辦人",
    detail: "表單核准通過",
  });

  // 怎麼核准的點數，匯到另一個資料庫中?

  await form.save();

  return handleSuccess(res, 200, "true", "表單核准", form);
};

// form review reject
export const rejectFormByID = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, "false", "ID 格式錯誤");
  }

  //解析revisionNote
  const { rejectedReason } = rejectedReasonSchema.parse(req.body);

  const form = await CompetitionFormDB.findById(id);
  if (!form) {
    throw new AppError(404, "false", "找不到表單資料");
  }

  if (!form.advisor.isAgreed) {
    throw new AppError(400, "false", "表單尚未取得指導老師同意，無法編輯");
  }

  if (form.isLocked) {
    throw new AppError(403, "false", "表單已鎖定");
  }

  if (!["resubmitted", "submitted"].includes(form.status)) {
    throw new AppError(400, "false", "目前表單狀態不可審核");
  }

  if (form.status === "rejected") {
    throw new AppError(400, "false", "表單未通過，無法重複審核");
  }

  const director = await UserDB.findOne({
    roles: "director",
    isDeleted: false,
  });
  if (!director) {
    throw new AppError(404, "false", "找不到主管");
  }

  const formId = (form._id as Types.ObjectId).toString();
  const handleName = req.user?.name;
  const handleEmail = req.user?.email;
  const contactName = form.contact.name;
  const contactEmail = form.contact.email;
  const formStatus = "rejected";
  const contestName = form.name;

  const directorEmail = director.email;

  if (!handleEmail) {
    throw new AppError(403, "false", "無法取得承辦人 email");
  }

  await queueFormEmail({
    formId: formId,
    to: contactEmail,
    subject: `${contestName} 點數申請「未通過」通知`,
    templateName: "FormRejectEmail",
    templateData: {
      contactName: contactName,
      contestName: contestName,
      rejectedReason: rejectedReason,
      handleEmail: handleEmail,
    },
    bcc: [directorEmail, handleEmail],
  });

  form.editToken = "";
  form.revisionNote = undefined;
  form.rejectedReason = rejectedReason;
  form.isLocked = true;
  form.status = formStatus;
  form.updatedAt = new Date();
  form.history.push({
    type: "status_changed",
    timestamp: new Date(),
    user: handleName || "未知承辦人",
    detail: `未通過原因：${rejectedReason}`,
  });

  await form.save();

  return handleSuccess(res, 200, "true", "表單未通過", form);
};

// extend the expiration date of a form
export const extendExpiryDateById = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, "false", "ID 格式錯誤");
  }

  const form = await CompetitionFormDB.findById(id);
  if (!form) {
    throw new AppError(404, "false", "找不到表單資料");
  }

  const now = new Date();
  if (now < form.expirationDate) {
    throw new AppError(400, "false", "表單尚未到期，無法延長有效期限");
  }

  if (form.isLocked === true) {
    throw new AppError(403, "false", "表單已鎖定");
  }

  if (form.status !== "needs_revision") {
    throw new AppError(400, "false", "目前表單狀態不可以延期");
  }

  const formId = (form._id as Types.ObjectId).toString();
  const handleName = req.user?.name;
  const handleEmail = req.user?.email;
  const contactName = form.contact.name;
  const contactEmail = form.contact.email;
  const contestName = form.name;
  const oldExpirationDate = form.expirationDate;
  const newExpirationDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const editToken = form.editToken;

  const studentEditURL = `${process.env.FRONTEND_URL}/edit/${editToken}`;

  if (!handleEmail) {
    throw new AppError(403, "false", "無法取得承辦人 email");
  }

  await queueFormEmail({
    formId: formId,
    to: contactEmail,
    subject: `${contestName} 點數申請「延長」通知`,
    templateName: "EditTokenExtendEmail",
    templateData: {
      contactName: contactName,
      contestName: contestName,
      handlEmail: handleEmail,
      url: studentEditURL,
      date: newExpirationDate.toISOString(),
    },
  });

  form.expirationDate = newExpirationDate;
  form.updatedAt = new Date();
  form.history.push({
    type: "note_added",
    timestamp: new Date(),
    user: handleName || "未知使用者",
    detail: `延長有效期限\n從：${oldExpirationDate.toISOString()}\n至：${form.expirationDate.toISOString()}`,
  });

  await form.save();

  return handleSuccess(res, 200, "true", "表單有效期限已延長", form);
};

// lock form
export const lockFormById = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, "false", "ID 格式錯誤");
  }

  const form = await CompetitionFormDB.findById(id);
  if (!form) {
    throw new AppError(404, "false", "找不到表單資料");
  }

  if (form.isLocked === true) {
    throw new AppError(403, "false", "表單已鎖定");
  }

  if (!["resubmitted", "submitted"].includes(form.status)) {
    throw new AppError(40, "false", "目前表單狀態不可鎖定");
  }

  const userName = req.user?.name || "未知使用者";

  form.isLocked = true;
  form.updatedAt = new Date();
  form.history.push({
    type: "note_added",
    timestamp: new Date(),
    user: userName,
    detail: "表單已鎖定",
  });

  await form.save();

  return handleSuccess(res, 200, "true", "表單已鎖定", form);
};

// unlock form
export const unlockFormById = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, "false", "ID 格式錯誤");
  }

  const form = await CompetitionFormDB.findById(id);
  if (!form) {
    throw new AppError(404, "false", "找不到表單資料");
  }

  if (form.isLocked === false) {
    throw new AppError(400, "false", "表單未鎖定");
  }

  const userName = req.user?.name || "未知使用者";

  form.isLocked = false;
  form.updatedAt = new Date();
  form.history.push({
    type: "note_added",
    timestamp: new Date(),
    user: userName,
    detail: "表單已解除鎖定",
  });

  await form.save();

  return handleSuccess(res, 200, "true", "表單已解鎖", form);
};

// delete file
export const deleteSingleFileById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { fileUrl } = req.query;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, "false", "ID 格式錯誤");
  }

  if (!fileUrl || typeof fileUrl !== "string") {
    throw new AppError(400, "false", "請提供要刪除的檔案 URL");
  }

  const form = await CompetitionFormDB.findById(id);
  if (!form) {
    throw new AppError(404, "false", "找不到表單資料");
  }

  if (form.isLocked === true) {
    throw new AppError(403, "false", "表單已鎖定");
  }

  if (!form.evidenceFileUrls.includes(fileUrl)) {
    throw new AppError(404, "false", "指定檔案不在表單中");
  }

  const filePath = path.join(__dirname, "../../storage", fileUrl);
  if (!fs.existsSync(filePath)) {
    throw new AppError(404, "false", "找不到該檔案");
  }

  //刪除檔案
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // 更新表單中的檔案清單
  form.evidenceFileUrls = form.evidenceFileUrls.filter(
    (url) => url !== fileUrl
  );

  const userName = req.user?.name || "未知使用者";

  form.updatedAt = new Date();
  form.history.push({
    type: "note_added",
    timestamp: new Date(),
    user: userName,
    detail: `已刪除：${fileUrl}`,
  });

  await form.save();

  return handleSuccess(res, 200, "true", "檔案已刪除", form);
};

// download file
export const downloadSingleFile = async (req: Request, res: Response) => {
  //get不帶body，所需要用qurey
  const { id, fileName } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, "false", "ID 格式錯誤");
  }

  if (!fileName || typeof fileName !== "string") {
    throw new AppError(400, "false", "請提供檔案名稱");
  }

  const form = await CompetitionFormDB.findById(id);
  if (!form) {
    throw new AppError(404, "false", "找不到表單資料");
  }

  if (form.isLocked === true) {
    throw new AppError(403, "false", "表單已鎖定");
  }

  const fileUrl = `/uploads/${fileName}`;
  if (!form.evidenceFileUrls.includes(fileUrl)) {
    throw new AppError(403, "false", "無權限下載此檔案");
  }

  const filePath = path.join(__dirname, "../../storage", fileUrl);
  if (!fs.existsSync(filePath)) {
    throw new AppError(404, "false", "找不到該檔案");
  }

  const userName = req.user?.name || "未知使用者";

  form.updatedAt = new Date();
  form.history.push({
    type: userName,
    timestamp: new Date(),
    user: "承辦人",
    detail: `已下載：${fileName}`,
  });

  await form.save();

  return res.download(filePath, fileName, (err) => {
    if (err) {
      console.error("檔案下載失敗:", err);
      return res.status(500).send("檔案下載失敗");
    }
  });
};

// 重發教師token
export const resendTeacherToken = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, "false", "ID 格式錯誤");
  }

  const form = await CompetitionFormDB.findById(id);
  if (!form) {
    throw new AppError(404, "false", "找不到表單資料");
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

  if (form.isLocked) {
    throw new AppError(403, "false", "表單已鎖定");
  }

  const teacherToken = crypto.randomBytes(32).toString("hex");
  const advisorDbToken = crypto
    .createHash("sha256")
    .update(teacherToken)
    .digest("hex");

  const formId = (form._id as Types.ObjectId).toString();
  const handleName = req.user?.name;
  const teacherName = form.advisor.name;
  const teacherEmail = form.advisor.email;
  const status = "submitted";
  const newExpirationDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const contestLevel = form.level;
  const contestName = form.name;
  const contestGroup = form.group;
  const contestAward = form.award;
  const contactName = form.contact.name;

  const url = `${process.env.FRONTEND_URL}/verify-teacher?token=${teacherToken}`;

  await queueFormEmail({
    formId: formId,
    to: teacherEmail,
    subject: "請確認學生競賽申請表單(新)",
    templateName: "TeacherConfirmEmail",
    templateData: {
      teacherName: teacherName,
      url: url,
      level: contestLevel,
      contestName: contestName,
      contestGroup: contestGroup,
      contestAward: contestAward,
      contactName: contactName,
    },
  });

  form.status = status;
  form.advisor.teacherConfirmToken = advisorDbToken;
  form.advisor.teacherConfirmExpires = newExpirationDate;
  form.updatedAt = new Date();
  form.history.push({
    type: "note_added",
    timestamp: new Date(),
    user: handleName || "未知使用者",
    detail: `${teacherName} 老師申請新的token連結`,
  });

  await form.save();

  return handleSuccess(res, 200, "true", "重發老師token", form);
};
