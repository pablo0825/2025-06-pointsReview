// ReviewReminderEmail.tsx
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Text,
} from "@react-email/components";

interface Props {
  formId: string;
  userName: string;
  status: string;
}

export default function ReviewReminderEmail({
  userName,
  formId,
  status,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>申請審查提醒</Preview>
      <Body style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
        <Container>
          <Text>{userName} 承辦人，</Text>
          <Text>提醒您，有一筆表單編號：{formId}</Text>
          <Text>{status}</Text>
          <Text>等待您的審查，請您盡速處理</Text>
        </Container>
      </Body>
    </Html>
  );
}
