import { Pool } from "pg";
import { env } from "../config/env";
import type { DatabaseClient } from "./types";
import { getSafeErrorSummary } from "../utils/safeLogging";

export const pool = new Pool({
  connectionString: env.databaseUrl,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error", {
    error: getSafeErrorSummary(error),
  });
});

export async function closePool(): Promise<void> {
  await pool.end();
}

export async function verifyPostgresConnection(
  client: DatabaseClient = pool,
): Promise<void> {
  await client.query("SELECT 1");
}

export type { DatabaseClient };
