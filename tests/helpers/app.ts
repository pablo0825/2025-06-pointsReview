import request from "supertest";

import { createApp } from "../../src/app";

// Use this when a test needs the Express app object itself without opening a port.
export function createTestApp() {
  return createApp();
}

// Use this when a test wants to send HTTP requests to the app through supertest.
export function requestTestApp() {
  return request(createTestApp());
}
