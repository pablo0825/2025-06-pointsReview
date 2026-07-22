import type { DatabaseClient } from "../db/types";

export interface PublicAdvisorRow {
  id: string;
  name: string;
  title_code: number;
  department: string;
  is_director: boolean;
}

export async function list(
  client: DatabaseClient,
): Promise<PublicAdvisorRow[]> {
  const result = await client.query<PublicAdvisorRow>(
    `SELECT a.id::text, a.name, a.title_code, a.department, a.is_director
     FROM advisors a
     JOIN users u ON u.id = a.user_id
     WHERE a.is_active = TRUE
       AND u.is_active = TRUE
       AND u.activated_at IS NOT NULL
     ORDER BY a.is_director DESC, a.name, a.id`,
  );
  return result.rows;
}

export const PublicAdvisorRepository = { list };
