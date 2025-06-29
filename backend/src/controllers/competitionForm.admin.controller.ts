//competitionFrom.admin.controllers
import { Request, Response } from "express";
import { CompetitionForm } from "../models/competitionForm.models";
import {
  reviseNoteSchema,
  rejectedReasonSchema,
} from "../validators/competitionForm.schema";
import { z } from "zod";
import mongoose from "mongoose";

// 查詢所有表單
export const getAllFormDate = async (req: Request, res: Response) => {
  try {
    const filter: any = {};

    // 等之後要做指定查詢，在來處理這個部分
    /* if (req.query.status) {
      filter.status = req.query.status;
    } */

    const forms = await CompetitionForm.find(filter)
      .sort({ _id: -1 })
      .select("name date level award status contact.name");

    if (forms.length === 0) {
      res.status(404).json({
        status: "fail",
        message: "目前尚無任何表單資料",
      });
      return;
    }

    res.status(200).json({
      status: "success",
      results: forms.length,
      message: "查詢成功",
      data: { forms },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: "error",
      message: "伺服器錯誤",
    });
  }
};

// 查詢指定表單
export const getFormById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        status: "fail",
        message: "ID 格式錯誤",
      });
      return;
    }

    const form = await CompetitionForm.findById(id);

    if (!form) {
      res.status(404).json({ status: "fail", message: "找不到表單資料" });
      return;
    }

    res.status(200).json({
      status: "success",
      message: `查詢 ${form._id} 成功`,
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

// 把form status設定為補件
export const reviseFormById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        status: "fail",
        message: "ID 格式錯誤",
      });
      return;
    }

    //解析revisionNote
    const { revisionNote } = reviseNoteSchema.parse(req.body);

    const form = await CompetitionForm.findById(id);

    if (!form) {
      res.status(404).json({ status: "fail", message: "找不到表單資料" });
      return;
    }

    if (form.isLocked === true) {
      res.status(403).json({
        status: "fail",
        message: "表單已鎖定，請先解鎖",
      });
      return;
    }

    if (!["resubmitted", "submitted"].includes(form.status)) {
      res.status(400).json({
        status: "fail",
        message: "目前表單狀態不可審核",
      });
      return;
    }

    //revisionNote輸入補件原因
    //設定expirationDate為7天
    //form status變為"resubmitted"
    //更新時間.
    //更新歷史紀錄
    form.revisionNote = revisionNote;
    form.expirationDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    form.status = "needs_revision";
    form.updatedAt = new Date();
    form.history.push({
      type: "status_changed",
      timestamp: new Date(),
      user: "承辦人",
      detail: `補件：${revisionNote}`,
    });

    await form.save();

    res.status(200).json({
      status: "success",
      message: "更新成功",
      data: form,
    });
  } catch (err) {
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

// form review approve
export const approveFormById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        status: "fail",
        message: "ID 格式錯誤",
      });
      return;
    }

    const form = await CompetitionForm.findById(id);

    if (!form) {
      res.status(404).json({ status: "fail", message: "找不到表單資料" });
      return;
    }

    if (form.isLocked === true) {
      res.status(403).json({
        status: "fail",
        message: "表單已鎖定，請先解鎖",
      });
      return;
    }

    if (!["resubmitted", "submitted"].includes(form.status)) {
      res.status(400).json({
        status: "fail",
        message: "目前表單狀態不可審核",
      });
      return;
    }

    if (form.status === "approved") {
      res
        .status(400)
        .json({ status: "fail", message: "表單已核准，無需重複核准" });
      return;
    }

    //revisonNote清空
    //isLocked變為true
    //form status變為"approved"
    //更新時間
    //更新歷史紀錄
    form.revisionNote = undefined;
    form.isLocked = true;
    form.status = "approved";
    form.updatedAt = new Date();
    form.history.push({
      type: "status_changed",
      timestamp: new Date(),
      user: "承辦人",
      detail: "表單核准通過",
    });

    await form.save();

    res.status(200).json({
      status: "success",
      message: "表單申請核准",
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

// form review reject
export const rejectFormByID = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        status: "fail",
        message: "ID 格式錯誤",
      });
      return;
    }

    //解析revisionNote
    const { rejectedReason } = rejectedReasonSchema.parse(req.body);

    const form = await CompetitionForm.findById(id);

    if (!form) {
      res.status(404).json({ status: "fail", message: "找不到表單資料" });
      return;
    }

    if (form.isLocked === true) {
      res.status(403).json({
        status: "fail",
        message: "表單已鎖定，請先解鎖",
      });
      return;
    }

    if (!["resubmitted", "submitted"].includes(form.status)) {
      res.status(400).json({
        status: "fail",
        message: "目前表單狀態不可審核",
      });
      return;
    }

    if (form.status === "rejected") {
      res.status(400).json({ status: "fail", message: "表單未通過" });
      return;
    }

    //rejectedReason輸入未通過原因
    //isLocked變為true
    //form status變為"rejected"
    //更新時間
    //更新歷史紀錄
    form.rejectedReason = rejectedReason;
    form.isLocked = true;
    form.status = "rejected";
    form.updatedAt = new Date();
    form.history.push({
      type: "status_changed",
      timestamp: new Date(),
      user: "承辦人",
      detail: `未通過原因：${rejectedReason}`,
    });

    await form.save();

    res.status(200).json({
      status: "success",
      message: "表單申請未通過",
      data: form,
    });
  } catch (err) {
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

// extend the expiration date of a form
export const extendExpiryDateById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        status: "fail",
        message: "ID 格式錯誤",
      });
      return;
    }

    const form = await CompetitionForm.findById(id);

    if (!form) {
      res.status(404).json({ status: "fail", message: "找不到表單資料" });
      return;
    }

    const now = new Date();
    if (now < form.expirationDate) {
      res
        .status(400)
        .json({ status: "fail", message: "表單尚未到期，無法延長有效期限" });
      return;
    }

    if (form.isLocked === true) {
      res.status(403).json({
        status: "fail",
        message: "表單已鎖定，請先解鎖",
      });
      return;
    }

    if (form.status !== "needs_revision") {
      res.status(400).json({
        status: "fail",
        message: "目前表單狀態不可以延期",
      });
      return;
    }

    const oldExpirationDate = form.expirationDate;

    //expirationDate重新設定7天到期日
    //更新時間
    //更新歷史紀錄
    form.expirationDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    form.updatedAt = new Date();
    form.history.push({
      type: "note_added",
      timestamp: new Date(),
      user: "承辦人",
      detail: `延長有效期限\n從：${oldExpirationDate.toISOString()}\n至：${form.expirationDate.toISOString()}`,
    });

    await form.save();

    res.status(200).json({
      status: "success",
      message: "表單有效期限已延長",
      data: form,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        status: "fail",
        message: "資料格式錯誤",
        errors: err.flatten(),
      });
      return;
    }

    console.error(err);
    res.status(500).json({
      status: "error",
      message: "伺服器錯誤",
    });
  }
};

// lock form
export const lockFormById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        status: "fail",
        message: "ID 格式錯誤",
      });
      return;
    }

    const form = await CompetitionForm.findById(id);
    if (!form) {
      res.status(404).json({ status: "fail", message: "找不到表單資料" });
      return;
    }

    if (form.isLocked === true) {
      res.status(403).json({
        status: "fail",
        message: "表單已鎖定，請先解鎖",
      });
      return;
    }

    if (!["resubmitted", "submitted"].includes(form.status)) {
      res.status(400).json({
        status: "fail",
        message: "目前表單狀態不可鎖定",
      });
      return;
    }

    //isLocked變為ture
    //更新時間
    //更新歷史紀錄
    form.isLocked = true;
    form.updatedAt = new Date();
    form.history.push({
      type: "note_added",
      timestamp: new Date(),
      user: "承辦人",
      detail: "表單已鎖定",
    });

    await form.save();

    res.status(200).json({
      status: "success",
      message: "表單已鎖定",
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

// unlock form
export const unlockFormById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        status: "fail",
        message: "ID 格式錯誤",
      });
      return;
    }

    const form = await CompetitionForm.findById(id);
    if (!form) {
      res.status(404).json({
        status: "fail",
        message: "找不到表單資料",
      });
      return;
    }

    if (!form.isLocked) {
      res.status(400).json({
        status: "fail",
        message: "表單未鎖定，無需解鎖",
      });
      return;
    }

    form.isLocked = false;
    form.updatedAt = new Date();
    form.history.push({
      type: "note_added",
      timestamp: new Date(),
      user: "承辦人",
      detail: "表單已解除鎖定",
    });

    await form.save();

    res.status(200).json({
      status: "success",
      message: "表單已解除鎖定",
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
