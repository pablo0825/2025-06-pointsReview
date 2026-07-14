import request from "supertest";

import { createApp } from "../../src/app";

export function createTestApp() {
  return createApp();
}

export function requestTestApp() {
  return request(createTestApp());
}
