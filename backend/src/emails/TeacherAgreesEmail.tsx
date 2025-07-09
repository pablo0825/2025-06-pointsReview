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
  projectTitle: string;
}

export default function TeacherAgreesEmail({
  contactName,
  advisorName,
  projectTitle,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>{advisorName}老師同意您的申請</Preview>
      <Body style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
        <Container>
          <Text>{contactName} 老師，</Text>
          <Text>
            您的競賽申請「{projectTitle}」已被指導老師 {advisorName} 同意。
          </Text>
          <Text>請等待後續審核流程通知。</Text>
        </Container>
      </Body>
    </Html>
  );
}
