// ResetPasswordEmail.tsx
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
  resetLink: string;
}

export default function ResetPasswordEmail({ username, resetLink }: Props) {
  return (
    <Html>
      <Head />
      <Preview>重設您的密碼</Preview>
      <Body style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
        <Container>
          <Text>嗨 {username}，</Text>
          <Text>請點擊以下連結來重設您的密碼：</Text>
          <Link href={resetLink}>{resetLink}</Link>
          <Text>如果您沒有要求重設密碼，請忽略這封信。</Text>
        </Container>
      </Body>
    </Html>
  );
}
