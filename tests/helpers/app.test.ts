import { describe, expect, it } from "vitest";

import { createTestApp } from "./app";

describe("test app harness", () => {
  it("loads the Express app without starting a server", async () => {
    const app = createTestApp();

    expect(typeof app).toBe("function");
    expect(typeof app.handle).toBe("function");
  });
});
