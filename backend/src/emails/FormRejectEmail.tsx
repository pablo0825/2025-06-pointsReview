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
  rejectedReason: string;
  handlEmail: string;
}

export default function FormRejectEmail({
  contactName,
  rejectedReason,
  handlEmail,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>點數申請「未通過」通知</Preview>
      <Body style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
        <Container>
          <Text>親愛的 {contactName} 同學，</Text>
          <Text>您的點數申請未通過。</Text>
          <Text>未通過原因：${rejectedReason}</Text>
          <Text>因此，本次申請將終止。</Text>
          <Text>謝謝您的配合。</Text>
          <Text>或是您有任何疑問的話，可以聯絡承辦人：${handlEmail}</Text>
        </Container>
      </Body>
    </Html>
  );
}
