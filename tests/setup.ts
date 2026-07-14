process.env.NODE_ENV ??= "test";
process.env.ENABLE_LEGACY_MONGO ??= "false";
process.env.DATABASE_URL ??=
  "postgres://points_review:points_review_password@localhost:5432/points_review_test";
