import { describe, expect, it } from "vitest";

import { assertSafeTestDatabaseUrl } from "./database";

describe("test database safety guard", () => {
  it("allows database names containing test", () => {
    expect(() => {
      assertSafeTestDatabaseUrl(
        "postgres://user:password@localhost:5432/points_review_test",
      );
    }).not.toThrow();
  });

  it("rejects database names that do not contain test", () => {
    expect(() => {
      assertSafeTestDatabaseUrl(
        "postgres://user:password@localhost:5432/points_review",
      );
    }).toThrow("non-test database");
  });
});
