import { Pool, types } from "pg";
import { env } from "../config/env";
import type { DatabaseClient } from "./types";
import { getSafeErrorSummary } from "../utils/safeLogging";

// A SQL DATE has no timezone. Keep it as YYYY-MM-DD instead of converting it
// to a JavaScript Date, which can shift the calendar date during serialization.
types.setTypeParser(1082, (value) => value);

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
