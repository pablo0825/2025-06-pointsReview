// TeacherAgreesEmail.tsx
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Text,
} from "@react-email/components";

interface Props {
  contactName: string;
  advisorName: string;
  contestName: string;
}

export default function TeacherAgreesEmail({
  contactName,
  advisorName,
  contestName,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>{advisorName}老師同意您的申請</Preview>
      <Body style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
        <Container>
          <Text>親愛的 {contactName} 同學您好，</Text>
          <Text>
            您的競賽申請「{contestName}」已被指導老師 {advisorName} 同意。
          </Text>
          <Text>請等待後續審核流程通知。</Text>
        </Container>
      </Body>
    </Html>
  );
}
