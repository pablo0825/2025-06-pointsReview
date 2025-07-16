// pointsTable.controller.ts
import { Request, Response } from "express";
import { AppError } from "../utils/AppError";
import { PointsTaskDB } from "../models/pointsTask.models";
import { PointsTableDB } from "../models/pointsTable.models";
import { handleSuccess } from "../utils/handleSuccess";

// 查詢每個年級的點數資料
export const getYearPointsData = async (req: Request, res: Response) => {
  const { year, limit = "50", page = "1", sortOrder = "asc" } = req.query;
  const sortDirection = sortOrder === "desc" ? -1 : 1;

  if (typeof year !== "string" || year.trim() === "") {
    throw new AppError(400, "false", "year不是string，或是不存在");
  }

  const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const parsedPage = Math.max(Number(page) || 1, 1);
  const skip = (parsedPage - 1) * parsedLimit;

  const total = await PointsTableDB.countDocuments({ year, isLocked: false });
  if (total === 0) {
    throw new AppError(404, "false", "目前尚無任何點數資料");
  }

  const pointsData = await PointsTableDB.find({
    year: year,
    isLocked: false,
  })
    .select("studentId name isComplete group status")
    .sort({ studentId: sortDirection })
    .skip(skip)
    .limit(parsedLimit);

  /*   if (pointsData.length === 0) {
    throw new AppError(404, "false", "目前尚無任何點數資料");
  }
 */

  return handleSuccess(res, 200, "true", "查詢成功", {
    total,
    page: parsedPage,
    limit: parsedLimit,
    data: pointsData,
  });
};

// 查詢指定學生的點數資料
export const getPointsData = async (req: Request, res: Response) => {
  const { studentId } = req.body;

  if (typeof studentId !== "string" || studentId.trim() === "") {
    throw new AppError(400, "false", "studentId不是string，或是不存在");
  }

  const user = await PointsTableDB.findOne({
    studentId: studentId,
    isLocked: false,
  }).select("studentId name isComplete group statuas");

  if (!user) {
    throw new AppError(404, "false", "找不到該學生的點數資料");
  }

  return handleSuccess(res, 200, "true", "查詢成功", user);
};
