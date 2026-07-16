process.env.NODE_ENV ??= "test";
process.env.ENABLE_LEGACY_MONGO ??= "false";

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  process.env.DATABASE_URL ??=
    "postgres://points_review:points_review_password@localhost:5432/points_review_test";
}
