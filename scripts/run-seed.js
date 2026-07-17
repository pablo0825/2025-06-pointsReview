const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");

const allowedEnvironments = new Set(["development", "test"]);
const seedEnvironment = process.argv[2];
const seedsRoot = path.resolve(process.cwd(), "seeds");
const seedRunsTable = "seed_runs";

function assertSeedEnvironment(value) {
  if (!value || !allowedEnvironments.has(value)) {
    throw new Error("Usage: npm run seed:development or npm run seed:test");
  }
}

function assertNonProductionRuntime() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development and test seeds cannot run in production");
  }
}

function readSeedFiles(environment) {
  const seedDir = path.join(seedsRoot, environment);

  if (!fs.existsSync(seedDir)) {
    return [];
  }

  return fs
    .readdirSync(seedDir)
    .filter((fileName) => !fileName.startsWith("."))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => {
      const filePath = path.join(seedDir, fileName);
      const sql = fs.readFileSync(filePath, "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");

      return {
        environment,
        fileName,
        filePath,
        sql,
        checksum,
      };
    });
}

async function ensureSeedRunsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${seedRunsTable} (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      environment VARCHAR(40) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      run_on TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT seed_runs_environment_file_unique
        UNIQUE (environment, file_name)
    )
  `);
}

async function readCompletedSeed(client, environment, fileName) {
  const result = await client.query(
    `SELECT checksum FROM ${seedRunsTable} WHERE environment = $1 AND file_name = $2`,
    [environment, fileName],
  );

  return result.rows[0] ?? null;
}

async function runSeed(client, seed) {
  const completedSeed = await readCompletedSeed(client, seed.environment, seed.fileName);

  if (completedSeed) {
    if (completedSeed.checksum !== seed.checksum) {
      throw new Error(
        `Seed ${seed.environment}/${seed.fileName} was already run with a different checksum`,
      );
    }

    console.log(`Skipped ${seed.environment}/${seed.fileName}`);
    return;
  }

  await client.query("BEGIN");

  try {
    await client.query(seed.sql);
    await client.query(
      `INSERT INTO ${seedRunsTable} (environment, file_name, checksum) VALUES ($1, $2, $3)`,
      [seed.environment, seed.fileName, seed.checksum],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  console.log(`Ran ${seed.environment}/${seed.fileName}`);
}

async function main() {
  assertSeedEnvironment(seedEnvironment);
  assertNonProductionRuntime();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for seed scripts");
  }

  const seeds = readSeedFiles(seedEnvironment);
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();

  try {
    await ensureSeedRunsTable(client);

    for (const seed of seeds) {
      await runSeed(client, seed);
    }

    console.log(`Seed files: ${seeds.length}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
