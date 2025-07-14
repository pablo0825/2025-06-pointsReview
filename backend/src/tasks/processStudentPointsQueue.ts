// processStudentPointsQueue.ts
import { pointsTableDB } from "../models/pointsTable.models";
import { PointsTaskDB } from "../models/pointsTask.models";

export const processStudentPointsQueue = async () => {
  const pendingTasks = await PointsTaskDB.find({ status: "pending" }).limit(10);

  for (const task of pendingTasks) {
    try {
      task.status = "processing";
      await task.save();

      const studentId = task.studentId;
      const points = task.points;

      const user = await pointsTableDB.findOne({
        studentId: studentId,
        isLocked: false,
      });
      if (!user) {
        console.log("找不到使用者");
        continue;
      }

      user.group = user.group || {};

      const currentContestPoints =
        typeof user.group.contest === "number" ? user.group.contest : 0;
      const newContestPoints = currentContestPoints + points;

      user.group.contest = newContestPoints;
      user.history.push({
        type: "status_changed",
        timestamp: new Date(),
        user: user.name || "未知學生",
        detail: `原點數：${currentContestPoints}，新點數：${newContestPoints}`,
      });

      await user.save();

      task.status = "success";
      task.err = undefined;

      await task.save();
    } catch (err) {
      console.error(`處理任務 ${task._id} 失敗:`, err);

      if (task.status === "processing") task.status = "pending";

      if (task.retries < task.maxRetries) task.retries += 1;

      if (task.retries > task.maxRetries) task.status = "failed";

      if (err instanceof Error) {
        task.err = err.message;
      } else {
        task.err = "未知錯誤";
      }

      await task.save();
    }
  }
};
