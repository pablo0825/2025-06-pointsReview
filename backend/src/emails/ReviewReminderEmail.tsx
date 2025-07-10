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
  handleName: string;
  status: string;
}

export default function ReviewReminderEmail({
  handleName,
  formId,
  status,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>申請審查提醒</Preview>
      <Body style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
        <Container>
          <Text>{handleName} 承辦人，</Text>
          <Text>提醒您，有一筆表單編號：{formId}</Text>
          <Text>狀態：{status}</Text>
          <Text>等待您的審查，請您盡速處理</Text>
        </Container>
      </Body>
    </Html>
  );
}
