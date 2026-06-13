// TeacherAgreesEmail.tsx
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
  revisionNote: String;
  url: string;
  handlEmail: String;
}

export default function FormRevisionEmail({
  contactName,
  contestName,
  revisionNote,
  handlEmail,
  url,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>競賽申請「{contestName}」表單退件</Preview>
      <Body style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
        <Container>
          <Text>親愛的 {contactName} 同學您好，</Text>
          <Text>您的競賽申請「{contestName}」被承辦人退件。</Text>
          <Text>退件原因：${revisionNote}</Text>
          <Text>
            請您按照上述原因，修改表單後再送出(可從下方連結修改表單)。
          </Text>
          <Text>表單修改連結：</Text>
          <Link href={url}>{url}</Link>
          <Text>感謝您的配合。</Text>
          <Text>或是您有任何疑問的話，可以聯絡承辦人：${handlEmail}</Text>
        </Container>
      </Body>
    </Html>
  );
}
