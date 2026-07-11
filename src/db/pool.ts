import { Pool, type PoolClient } from "pg";
import { env } from "../config/env";

export type DatabaseClient = Pick<Pool | PoolClient, "query">;

export const pool = new Pool({
  connectionString: env.databaseUrl,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});

export async function closePool(): Promise<void> {
  await pool.end();
}
