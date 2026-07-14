import { describe, expect, it, vi } from "vitest";

import { verifyPostgresConnection } from "../../src/db/pool";
import type { DatabaseClient } from "../../src/db/types";

describe("PostgreSQL startup check", () => {
  it("verifies PostgreSQL connectivity with a minimal query", async () => {
    const client: DatabaseClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    };

    await verifyPostgresConnection(client);

    expect(client.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("propagates connection check failures", async () => {
    const error = new Error("connection failed");
    const client: DatabaseClient = {
      query: vi.fn().mockRejectedValue(error),
    };

    await expect(verifyPostgresConnection(client)).rejects.toBe(error);
  });
});
