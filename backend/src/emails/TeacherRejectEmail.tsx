// TeacherRejectEmail.tsx
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

export default function TeacherRejectEmail({
  contactName,
  advisorName,
  projectTitle,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>{advisorName}老師 拒絕您的申請</Preview>
      <Body style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
        <Container>
          <Text>親愛的 {contactName} 同學，</Text>
          <Text>
            您的競賽申請「{projectTitle}」已被指導老師 {advisorName} 拒絕。
          </Text>
          <Text>因此，本次申請將終止，請您與指導老師聯繫後，再重新申請</Text>
          <Text>謝謝您的配合</Text>
        </Container>
      </Body>
    </Html>
  );
}
