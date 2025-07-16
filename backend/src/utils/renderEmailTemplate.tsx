// renderEmailTemplate.tsx
import { render } from "@react-email/render";
import TeacherConfirmEmail from "../emails/TeacherConfirmEmail";
import ApplicantNotifyEmail from "../emails/ApplicantNotifyEmail";
import { JSX } from "react";
import ReviewReminderEmail from "../emails/ReviewReminderEmail";
import TeacherAgreesEmail from "../emails/TeacherAgreesEmail";
import TeacherRejectEmail from "../emails/TeacherRejectEmail";

const templateMap: Record<string, (date: any) => JSX.Element> = {
  TeacherConfirmEmail: (data) => <TeacherConfirmEmail {...data} />,
  ApplicantNotifyEmail: (data) => <ApplicantNotifyEmail {...data} />,
  ReviewReminderEmail: (data) => <ReviewReminderEmail {...data} />,
  TeacherAgreesEmail: (data) => <TeacherAgreesEmail {...data} />,
  TeacherRejectEmail: (data) => <TeacherRejectEmail {...data} />,
};

export function renderEmailTemplate(name: string, data: any): Promise<string> {
  const component = templateMap[name];
  if (!component) throw new Error(`未知的模板名稱：${name}`);
  return render(component(data));
}
