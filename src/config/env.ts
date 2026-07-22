import dotenv from "dotenv";

dotenv.config({ path: "./config.env" });
dotenv.config();

export function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return value;
}

export function getRequiredEnv(name: string): string {
  const value = getOptionalEnv(name);

  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }

  return value;
}

function getNumberEnv(name: string, defaultValue: number): number {
  const value = getOptionalEnv(name);

  if (!value) {
    return defaultValue;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    throw new Error(`${name} environment variable must be a valid number`);
  }

  return parsedValue;
}

function getBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = getOptionalEnv(name);

  if (!value) {
    return defaultValue;
  }

  if (["true", "1", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error(`${name} environment variable must be a boolean value`);
}

export function getLegacyMongoConnectionString(): string {
  const database = getRequiredEnv("DATABASE");
  const databasePassword = getRequiredEnv("DATABASE_PASSWORD");

  return database.replace("<db_password>", databasePassword);
}

export const env = {
  nodeEnv: getOptionalEnv("NODE_ENV") ?? "development",
  port: getNumberEnv("PORT", 3001),
  databaseUrl: getRequiredEnv("DATABASE_URL"),
  enableLegacyMongo: getBooleanEnv("ENABLE_LEGACY_MONGO", false),
  redisUrl: getOptionalEnv("REDIS_URL"),
  frontendUrl: getOptionalEnv("FRONTEND_URL") ?? "http://localhost:3000",
  privateFileStorageRoot: getOptionalEnv("PRIVATE_FILE_STORAGE_ROOT"),
  advisorConfirmationTtlHours: getNumberEnv(
    "ADVISOR_CONFIRMATION_TTL_HOURS",
    168,
  ),
};
