import { beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();
const queryMock = vi.fn();
const releaseMock = vi.fn();

vi.mock("../../src/db/pool", () => ({
  pool: {
    connect: connectMock,
  },
}));

describe("withTransaction", () => {
  beforeEach(() => {
    connectMock.mockReset();
    queryMock.mockReset();
    releaseMock.mockReset();
    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock,
    });
  });

  it("commits when callback succeeds", async () => {
    const { withTransaction } = await import("../../src/db/transaction");
    queryMock.mockResolvedValue({ rows: [] });

    const result = await withTransaction(async () => "ok");

    expect(result).toBe("ok");
    expect(queryMock).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(queryMock).toHaveBeenNthCalledWith(2, "COMMIT");
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("rolls back when callback fails", async () => {
    const { withTransaction } = await import("../../src/db/transaction");
    queryMock.mockResolvedValue({ rows: [] });

    await expect(
      withTransaction(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(queryMock).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(queryMock).toHaveBeenNthCalledWith(2, "ROLLBACK");
    expect(releaseMock).toHaveBeenCalledOnce();
  });
});
