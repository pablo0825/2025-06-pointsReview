import { Pool } from "pg";
import { env } from "../config/env";
import type { DatabaseClient } from "./types";

export const pool = new Pool({
  connectionString: env.databaseUrl,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});

export async function closePool(): Promise<void> {
  await pool.end();
}

export type { DatabaseClient };
