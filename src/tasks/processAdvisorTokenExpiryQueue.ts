import { CompetitionFormDB } from "../models/competitionForm.models";

export const processAdvisorTokenExpiryQueue = async () => {
  const pendingTasks = await CompetitionFormDB.find({
    status: "submitted",
    "advisor.teacherConfirmExpires": { $exists: true },
  }).limit(5);

  for (const task of pendingTasks) {
    const now = new Date();
    try {
      if (
        task.advisor.teacherConfirmExpires &&
        now > task.advisor.teacherConfirmExpires
      ) {
        task.status = "reserved";
        task.advisor.teacherConfirmToken = undefined;
        task.advisor.teacherConfirmExpires = undefined;
        task.history.push({
          type: "updated",
          timestamp: new Date(),
          user: task.advisor.name || "advisor",
          detail: "指導老師 token 已過期，表單狀態轉為保留",
        });

        await task.save();
      }
    } catch (err) {
      console.error(`處理表單 ${task._id} 的指導老師 token 過期失敗:`, err);
    }
  }
};
