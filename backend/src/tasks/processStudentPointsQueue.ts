// processStudentPointsQueue.ts
import { pointsTableDB } from "../models/pointsTable.models";
import { PointsTaskDB } from "../models/pointsTask.models";
import { UserDB } from "../models/user.models";
import { AppError } from "../utils/AppError";
import { queueFormEmail } from "./queueFormEmail";

export const processStudentPointsQueue = async () => {
  const pendingTasks = await PointsTaskDB.find({ status: "pending" }).limit(10);

  for (const task of pendingTasks) {
    const { formId, studentId, points, name } = task;
    try {
      const user = await pointsTableDB.findOne({
        studentId: studentId,
        isLocked: false,
      });
      if (!user) {
        console.log(`找不到學生 ${studentId}`);
        task.err = "找不到使用者";
        await task.save();
        continue;
      }

      user.group =
        typeof user.group === "object" && user.group !== null ? user.group : {};

      const current =
        typeof user.group.contest === "number" ? user.group.contest : 0;
      const updated = current + points;

      user.group = { ...user.group, contest: updated };
      user.history.push({
        type: "status_changed",
        timestamp: new Date(),
        user: user.name || "未知學生",
        detail: `原點數：${current}，新點數：${updated}`,
      });

      await user.save();

      task.status = "success";
      task.err = undefined;

      await task.save();
    } catch (err) {
      console.error(`任務 ${task._id} 處理失敗，第 ${task.retries} 次：`, err);

      task.retries += 1;

      if (task.retries >= task.maxRetries) {
        task.status = "failed";
        const originalError = err instanceof Error ? err.message : "未知錯誤";
        task.err = `三次錯誤，通知承辦人處理（最後錯誤：${originalError}）`;

        const director = await UserDB.findOne({
          roles: "director",
          isDeleted: false,
        });
        const handle = await UserDB.findOne({
          roles: "handle",
          isDeleted: false,
        });

        if (!director || !handle) {
          console.error("找不到主管或承辦人，無法發送錯誤通知");
        } else {
          const handleName = handle.username;
          const handleEmail = handle.email;
          const directorEmail = director.email;

          await queueFormEmail({
            formId: formId.toString(),
            to: handleEmail,
            subject: "點數申請「異常」通知",
            templateName: "pointsErrorEmail",
            templateData: {
              handleName,
              formId,
              studentId,
              name,
              points,
            },
            bcc: [directorEmail],
          });
        }
      } else {
        task.status = "pending";
        task.err = err instanceof Error ? err.message : "未知錯誤";
      }

      await task.save();
    }
  }
};
