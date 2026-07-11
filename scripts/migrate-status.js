const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const migrationsDir = path.resolve(process.cwd(), "migrations");
const migrationTable = "pgmigrations";

function readMigrationFiles() {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  return fs
    .readdirSync(migrationsDir)
    .filter((fileName) => !fileName.startsWith("."))
    .filter((fileName) => /\.(js|ts|sql)$/.test(fileName))
    .map((fileName) => ({
      fileName,
      migrationName: path.parse(fileName).name,
    }))
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
}

async function readAppliedMigrations(client) {
  const tableResult = await client.query("select to_regclass($1) as table_name", [
    `public.${migrationTable}`,
  ]);

  if (!tableResult.rows[0].table_name) {
    return [];
  }

  const result = await client.query(
    `select name, run_on from ${migrationTable} order by run_on asc, name asc`,
  );

  return result.rows;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for migrate:status");
  }

  const migrationFiles = readMigrationFiles();
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();

  try {
    const appliedMigrations = await readAppliedMigrations(client);
    const appliedNames = new Set(appliedMigrations.map((migration) => migration.name));
    const pendingMigrations = migrationFiles.filter(
      (migration) => !appliedNames.has(migration.migrationName),
    );

    console.log(`Migration files: ${migrationFiles.length}`);
    console.log(`Applied migrations: ${appliedMigrations.length}`);
    console.log(`Pending migrations: ${pendingMigrations.length}`);

    if (pendingMigrations.length > 0) {
      console.log("");
      console.log("Pending:");
      pendingMigrations.forEach((migration) => console.log(`- ${migration.fileName}`));
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
