import dotenv from "dotenv";

dotenv.config({ path: "./config.env" });
dotenv.config();

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return value;
}

function getRequiredEnv(name: string): string {
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

export const env = {
  nodeEnv: getOptionalEnv("NODE_ENV") ?? "development",
  port: getNumberEnv("PORT", 3001),
  databaseUrl: getRequiredEnv("DATABASE_URL"),
  redisUrl: getOptionalEnv("REDIS_URL"),
};
