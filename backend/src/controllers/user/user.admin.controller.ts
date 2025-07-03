// user.admin.controller.ts
import { Request, Response } from "express";
import { UserDB } from "../../models/user.models";
import { AppError } from "../../utils/AppError";
import { handleSuccess } from "../../utils/handleSuccess";
import mongoose from "mongoose";
import { userDataSchema } from "../../validators/auth.schema";
import bcrypt from "bcrypt";

//取得所有使用者資料
export const getAllUserData = async (req: Request, res: Response) => {
  const curentUserRoles = req.user?.role;
  if (!curentUserRoles) {
    throw new AppError(403, "false", "無法取得目前的使用者角色");
  }

  let query = { isDeleted: false };

  if (curentUserRoles.includes("director")) {
    Object.assign(query, { roles: { $ne: "admin" } });
  }

  const userData = await UserDB.find(query)
    .sort({ createdAt: -1 })
    .select("username email roles");

  if (userData.length === 0) {
    throw new AppError(404, "false", "目前尚無任何使用者資料");
  }

  return handleSuccess(
    res,
    200,
    "true",
    "查詢成功",
    { userData },
    userData.length
  );
};

// 更新使用者資料
export const updatedUserDataById = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, "false", "ID 格式錯誤");
  }

  if (req.user?.id.toString() !== id) {
    throw new AppError(403, "false", "您不能編輯其他使用者的資料");
  }

  const validateUserData = userDataSchema.parse(req.body);
  const { username, email, newPassword } = validateUserData;

  const user = await UserDB.findOne({ _id: id, isDeleted: false });
  if (!user) {
    throw new AppError(404, "false", "找不到使用者");
  }

  // !!檢驗是否有字串，以及是否有值
  const hasChanges =
    user.username !== username || user.email !== email || !!newPassword;

  if (!hasChanges) {
    throw new AppError(400, "false", "沒有異動內容，無需更新");
  }

  user.username = username;
  user.email = email;

  if (newPassword) {
    const hashed = await bcrypt.hash(newPassword, 12);
    user.password = hashed;
  }

  user.history.push({
    timestamp: new Date(),
    user: req.user?.username || "unknown",
    detail: "更新使用者資料",
  });

  await user.save();

  return handleSuccess(res, 200, "true", "使用者資料更新成功", {
    id: user._id,
    username: user.username,
    email: user.email,
  });
};

// 分配使用者角色
export const assignRoleById = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, "false", "ID 格式錯誤");
  }

  const { role } = req.body;

  const curentUserRoles = req.user?.role;
  if (!curentUserRoles) {
    throw new AppError(403, "false", "無法取得目前的使用者角色");
  }

  let allowedRoles: string[] = [];
  if (curentUserRoles.includes("admin")) {
    allowedRoles = ["user", "director", "noRole"];
  } else if (curentUserRoles.includes("director")) {
    allowedRoles = ["user", "noRole"];
  } else {
    throw new AppError(403, "false", "您沒有權限指派角色");
  }

  if (typeof role !== "string" || !allowedRoles.includes(role)) {
    throw new AppError(400, "false", "提供的角色不合法");
  }

  const user = await UserDB.findOne({ _id: id, isDeleted: false });
  if (!user) {
    throw new AppError(404, "false", "找不到使用者");
  }

  const previousUserRole = user.roles;

  if (user.roles.includes("admin") && !role.includes("admin")) {
    throw new AppError(403, "false", "不能移除管理員身份");
  }

  if (user.isDeleted === true) {
    throw new AppError(403, "false", "無法分配角色給已刪除的使用者");
  }

  user.roles = role;
  user.history.push({
    timestamp: new Date(),
    user: req.user?.name || "user",
    detail: `原角色 ${previousUserRole} 更新成 ${user.roles}`,
  });

  await user.save();

  return handleSuccess(res, 200, "true", "角色更新成功", {
    id: user._id,
    username: user.username,
    roles: user.roles,
  });
};

// 刪除使用者
export const deleteUserById = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(400, "false", "ID 格式錯誤");
  }

  if (req.user?.id === id) {
    throw new AppError(403, "false", "您不能刪除自己的帳號");
  }

  const curentUserRoles = req.user?.role;
  if (!curentUserRoles) {
    throw new AppError(403, "false", "無法取得目前的使用者角色");
  }

  let allowedRolesToDelete: string[] = [];
  if (curentUserRoles.includes("admin")) {
    allowedRolesToDelete = ["user", "director", "noRole"];
  } else if (curentUserRoles.includes("director")) {
    allowedRolesToDelete = ["user", "noRole"];
  } else {
    throw new AppError(403, "false", "您沒有權限刪除任何使用者。");
  }

  const user = await UserDB.findOne({ _id: id, isDeleted: false });
  if (!user) {
    throw new AppError(404, "false", "找不到使用者");
  }

  if (!allowedRolesToDelete.includes(user.roles)) {
    throw new AppError(403, "false", "您沒有權限刪除角色");
  }

  user.isDeleted = true;
  user.history.push({
    timestamp: new Date(),
    user: req.user?.name || "user",
    detail: `${user.username} 使用者已刪除`,
  });
  await user.save();

  return handleSuccess(res, 200, "true", `${user.username} 使用者已刪除`, {
    id: user._id,
    username: user.username,
  });
};

export const getMe = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "false", "尚未驗證身分，請重新登入");
  }

  const user = await UserDB.findOne({ _id: userId, isDeleted: false }).select(
    "-password"
  );
  if (!user) {
    throw new AppError(404, "false", "找不到使用者資訊");
  }

  handleSuccess(res, 200, "true", "取得使用者資訊成功", {
    id: user._id,
    username: user.username,
    email: user.email,
    roles: user.roles,
  });
};
