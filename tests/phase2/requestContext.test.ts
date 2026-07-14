import { describe, expect, it } from "vitest";

import { getClientIp } from "../../src/utils/clientIp";
import { getRequestContext } from "../../src/utils/requestContext";

describe("request context", () => {
  it("uses the direct socket IP and ignores forged x-forwarded-for", () => {
    const req = {
      socket: { remoteAddress: "::ffff:127.0.0.1" },
      ip: "10.0.0.1",
      headers: { "x-forwarded-for": "203.0.113.10" },
      get: (name: string) => (name === "user-agent" ? "test-agent" : undefined),
      user: { id: "1", email: "user@example.com", role: "reviewer" },
    };

    const context = getRequestContext(req as never);

    expect(getClientIp(req as never)).toBe("127.0.0.1");
    expect(context).toEqual({
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
      currentUser: {
        id: "1",
        email: "user@example.com",
        role: "reviewer",
      },
    });
  });
});
