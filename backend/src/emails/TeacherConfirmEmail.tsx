// TeacherConfirmEmail.tsx
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Text,
  Link,
} from "@react-email/components";

interface Props {
  username: string;
  teacherConfirmURL: string;
}

export default function TeacherConfirmEmail({
  username,
  teacherConfirmURL,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>重設您的密碼</Preview>
      <Body style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
        <Container>
          <Text>親愛的 {username} 老師，</Text>
          <Text>有一份學生提交的競賽申請表單，等待您的確認。</Text>
          <Text>相關連結：</Text>
          <Link href={teacherConfirmURL}>{teacherConfirmURL}</Link>
        </Container>
      </Body>
    </Html>
  );
}
