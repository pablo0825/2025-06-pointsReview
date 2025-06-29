import { Request, Response } from "express";
import { CompetitionForm } from "../models/competitionForm.models";
import {
  reviseNoteSchema,
  competitionFormSchema,
} from "../validators/competitionForm.schema";
import { z } from "zod";
import { getChangedFields } from "../utils/getChangedFields";

//提交新表單
export const submitForm = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];

    if (files.length > 10) {
      res.status(400).json({ status: "fail", message: "最多上傳 10 個檔案" });
      return;
    }

    // 儲存檔案 URL 到 DB 中
    const fileUrls = files.map((file) => `/uploads/${file.filename}`);

    const validateDate = competitionFormSchema.parse(req.body);

    const newForm = await CompetitionForm.create({
      ...validateDate,
      evidenceFiles: fileUrls,
      history: [
        {
          type: "created",
          timestamp: new Date(),
          user: validateDate.contact?.name || "user",
          detail: "使用者創建表單",
        },
      ],
    });

    //const editToken = newForm.editToken;

    res.status(201).json({
      status: "success",
      message: "新增成功",
      data: newForm,
    });
    return;
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        status: "fail",
        message: "資料格式錯誤",
        errors: err.flatten(),
      });
      return;
    }

    //MongoDB 錯誤（如唯一鍵衝突）
    if (err.code === 11000 && err.keyPattern?.editToken) {
      res.status(409).json({
        status: "fail",
        message: "系統產生的 editToken 重複，請稍後再試一次",
      });
      return;
    }

    console.error(err);
    res.status(500).json({
      status: "error",
      message: "伺服器錯誤",
    });
    return;
  }
};

//根據 editToKen 取得表單
export const getFormByToken = async (req: Request, res: Response) => {
  try {
    const token = req.params.token;

    const form = await CompetitionForm.findOne({ editToken: token }).select(
      "-_id -history"
    );

    if (!form) {
      res.status(404).json({
        status: "fail",
        message: "找不到 editToken 對應的表單",
      });
      return;
    }

    const now = new Date();
    if (now > form.expirationDate) {
      res.status(403).json({ status: "fail", message: "編輯連結已過期" });
      return;
    }

    if (form.isLocked === true) {
      res.status(403).json({
        status: "fail",
        message: "表單已鎖定，無法再編輯",
      });
      return;
    }

    res.status(200).json({
      status: "success",
      message: "取得表單",
      data: form,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: "error",
      message: "伺服器錯誤",
    });
  }
};

//根據 editToKen 更新表單
export const updatedFormByToKen = async (req: Request, res: Response) => {
  try {
    const validateDate = competitionFormSchema.parse(req.body);
    const token = req.params.token;

    const form = await CompetitionForm.findOne({ editToken: token });

    if (!form) {
      res.status(404).json({
        status: "fail",
        message: "找不到 editToken 對應的表單",
      });
      return;
    }

    if (form.status !== "needs_revision") {
      res
        .status(403)
        .json({ status: "fail", message: "表單不在編輯狀態，無法編輯" });
      return;
    }

    const now = new Date();
    if (now > form.expirationDate) {
      res.status(403).json({ status: "fail", message: "編輯連結已過期" });
      return;
    }

    if (form.isLocked === true) {
      res.status(403).json({
        status: "fail",
        message: "表單已鎖定，無法再編輯",
      });
      return;
    }

    //把mongode document轉換成json儲存起來
    const original = form.toObject();
    const changedFields = getChangedFields(original, validateDate);

    //把validateDate合併到form裡面
    Object.assign(form, validateDate);

    //form status變為"resubmitted"
    //更新時間
    //更新歷史紀錄
    form.status = "resubmitted";
    form.updatedAt = new Date();
    form.history.push({
      type: "updated",
      timestamp: new Date(),
      user: validateDate.contact?.name || "user",
      detail: changedFields.length
        ? `使用者更新了欄位：${changedFields.join(", ")}`
        : "使用者提交了表單但無變更",
    });

    await form.save();

    res.status(200).json({
      status: "success",
      message: "更新成功",
      data: form,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        status: "fail",
        message: "資料格式錯誤",
        errors: err.flatten(),
      });
    }

    console.error(err);
    res.status(500).json({
      status: "error",
      message: "伺服器錯誤",
    });
  }
};
