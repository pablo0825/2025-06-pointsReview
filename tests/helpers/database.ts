import { Pool, type PoolClient } from "pg";

const TEST_DATABASE_URL_ENV = "TEST_DATABASE_URL";

export function getTestDatabaseUrl(): string {
  const databaseUrl =
    process.env[TEST_DATABASE_URL_ENV] ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      `${TEST_DATABASE_URL_ENV} or DATABASE_URL must be set for database tests`,
    );
  }

  assertSafeTestDatabaseUrl(databaseUrl);

  return databaseUrl;
}

export function assertSafeTestDatabaseUrl(databaseUrl: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run database tests in production");
  }

  const parsedUrl = new URL(databaseUrl);
  const databaseName = parsedUrl.pathname.replace(/^\//, "").toLowerCase();

  if (!databaseName.includes("test")) {
    throw new Error(
      `Refusing to run database tests against non-test database: ${databaseName}`,
    );
  }
}

export function createTestPool(): Pool {
  return new Pool({
    connectionString: getTestDatabaseUrl(),
  });
}

export async function withRollback<T>(
  pool: Pool,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("ROLLBACK");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
