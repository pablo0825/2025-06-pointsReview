import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Text,
  Section,
} from "@react-email/components";

interface Student {
  name: string;
  studentId: string;
  pointSubmitted: number;
}

interface Props {
  level: string;
  contestName: string;
  contestGroup: string;
  contestAward: string;
  date: Date;
  totalPoints: number;
  teacherName: string;
  students: Student[];
  contactName: string;
}

export default function FormApprovedEmail({
  level,
  contestName,
  contestGroup,
  contestAward,
  totalPoints,
  teacherName,
  students,
  contactName,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>表單審核通過通知</Preview>
      <Body
        style={{ backgroundColor: "#f3f3f5", fontFamily: "Arial, sans-serif" }}
      >
        <Container style={{ padding: "20px", backgroundColor: "#ffffff" }}>
          <Text>親愛的 {contactName} 同學您好，</Text>
          <Text
            style={{
              fontSize: "18px",
              fontWeight: "bold",
              marginBottom: "10px",
            }}
          >
            ✅ 您的表單申請已通過審核
          </Text>
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
            指導老師：{teacherName} 老師
          </Text>
          <Text style={{ fontSize: "16px", marginBottom: "20px" }}>
            總點數：{totalPoints}
          </Text>
          <Section>
            <table width="100%" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>姓名</th>
                  <th style={thStyle}>學號</th>
                  <th style={thStyle}>核准點數</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student, index) => (
                  <tr key={index}>
                    <td style={tdStyle}>{student.name}</td>
                    <td style={tdStyle}>{student.studentId}</td>
                    <td style={tdStyle}>{student.pointSubmitted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Text style={{ marginTop: "20px", fontSize: "14px", color: "#555" }}>
            如有疑問，請聯繫承辦單位。祝順利！
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const thStyle = {
  border: "1px solid #ccc",
  padding: "8px",
  backgroundColor: "#f0f0f0",
  textAlign: "left" as const,
};

const tdStyle = {
  border: "1px solid #ccc",
  padding: "8px",
};
