import { describe, expect, it } from "vitest";

import { createTestApp } from "./app";

describe("test app harness", () => {
  it("loads the Express app without starting a server", async () => {
    const app = createTestApp();

    // Express apps are callable request handlers and expose routing methods such as use().
    expect(typeof app).toBe("function");
    expect(typeof app.use).toBe("function");
  });
});
