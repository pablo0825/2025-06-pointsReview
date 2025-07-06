import { Html, Text, Button } from "@react-email/components";

interface Props {
  username: string;
  teacherName: string;
}

export default function ApplicantNotifyEmail({ username, teacherName }: Props) {
  return (
    <Html>
      <Text>親愛的 {username}：</Text>
      <Text>您已成功提交表單，我們已寄出確認信給指導老師 {teacherName}。</Text>
      <Text>待老師確認後，我們將通知您下一步。</Text>
      <Text>感謝您的配合。</Text>
    </Html>
  );
}
