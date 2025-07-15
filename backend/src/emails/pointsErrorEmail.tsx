// pointsErrorEmail.tsx
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
  studentId: string;
  name: string;
  points: number;
}

export default function pointsErrorEmail({
  handleName,
  formId,
  studentId,
  name,
  points,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>申請點數異常</Preview>
      <Body style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
        <Container>
          <Text>{handleName} 承辦人 您好，</Text>
          <Text>提醒您，有一筆表單編號：{formId}</Text>
          <Text>
            系統在自動處理以下學生點數時發生錯誤，且已重試三次仍未成功，請您協助確認與處理。
          </Text>
          <Text>學生姓名：{name}</Text>
          <Text>學號：{studentId}</Text>
          <Text>核定點數：{points}</Text>
          <Text>
            建議操作：
            請手動確認該學生是否存在於點數表中，若需要可於管理介面中直接處理此任務或聯繫相關人員。
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
