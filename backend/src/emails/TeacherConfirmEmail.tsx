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
  teacherName: string;
  url: string;
  level: string;
  contestName: string;
  contestGroup: string;
  contestAward: string;
  contactName: string;
}

export default function TeacherConfirmEmail({
  teacherName,
  url,
  level,
  contestName,
  contestGroup,
  contestAward,
  contactName,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>重設您的密碼</Preview>
      <Body style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
        <Container>
          <Text>親愛的 {teacherName} 老師，</Text>
          <Text>有一份學生提交的比賽點數申請表單，等待您的確認。</Text>
          <Text>相關連結：</Text>
          <Link href={url}>{url}</Link>
          <Text style={{ fontSize: "16px", marginBottom: "20px" }}>
            比賽等級：{level}
          </Text>
          <Text style={{ fontSize: "16px", marginBottom: "20px" }}>
            比賽名稱：{contestName}
          </Text>
          <Text style={{ fontSize: "16px", marginBottom: "20px" }}>
            比賽組別：{contestGroup}
          </Text>
          <Text style={{ fontSize: "16px", marginBottom: "20px" }}>
            比賽名次：{contestAward}
          </Text>
          <Text style={{ fontSize: "16px", marginBottom: "20px" }}>
            申請人：{contactName}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
