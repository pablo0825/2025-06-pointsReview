// EditTokenExtendEmail.tsx
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
  contactName: string;
  contestName: string;
  url: string;
  handlEmail: String;
  date: string;
}

export default function EditTokenExtendEmail({
  contactName,
  contestName,
  handlEmail,
  url,
  date,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>{contestName} 點數申請「延長」通知</Preview>
      <Body style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
        <Container>
          <Text>親愛的 {contactName} 同學您好，</Text>
          <Text>您的點數申請已延長至{date}。</Text>
          <Text>麻煩您在時間內，修改表單後再送出(可從下方連結修改表單)。</Text>
          <Text>表單修改連結：</Text>
          <Link href={url}>{url}</Link>
          <Text>感謝您的配合。</Text>
          <Text>或是您有任何疑問的話，可以聯絡承辦人：${handlEmail}</Text>
        </Container>
      </Body>
    </Html>
  );
}
