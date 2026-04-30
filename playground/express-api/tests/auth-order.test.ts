import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/server.js";

describe("auth middleware order", () => {
  it("/api/me returns 401 without auth", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
  });

  it("/api/admin returns 401 without auth", async () => {
    const res = await request(app).get("/api/admin");
    expect(res.status).toBe(401);
  });

  it("/api/me returns 200 with valid auth", async () => {
    const res = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer secret-token");
    expect(res.status).toBe(200);
  });

  it("/api/public/health returns 200 without auth", async () => {
    const res = await request(app).get("/api/public/health");
    expect(res.status).toBe(200);
  });
});
