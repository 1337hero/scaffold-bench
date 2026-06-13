import { describe, it, expect, beforeEach } from "bun:test";
import { createHmac } from "node:crypto";
import { createApp } from "../src/index";

const WEBHOOK_SECRET = "test-secret-key";

function sign(body: string): string {
  return "sha256=" + createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

describe("POST /webhooks/orders", () => {
  let app: ReturnType<typeof createApp>["app"];

  beforeEach(() => {
    process.env.WEBHOOK_SECRET = WEBHOOK_SECRET;
    ({ app } = createApp(":memory:"));
  });

  it("returns 200 for a valid signed request", async () => {
    const body = JSON.stringify({ event_id: "evt_001", type: "order.created", data: {} });
    const res = await app.request("/webhooks/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Signature": sign(body) },
      body,
    });
    expect(res.status).toBe(200);
  });

  it("returns 401 for a request with wrong signature", async () => {
    const body = JSON.stringify({ event_id: "evt_002", type: "order.created", data: {} });
    const res = await app.request("/webhooks/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Signature": "sha256=badhash" },
      body,
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for a request without signature", async () => {
    const body = JSON.stringify({ event_id: "evt_003", type: "order.created", data: {} });
    const res = await app.request("/webhooks/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 for a replayed event (idempotent)", async () => {
    const body = JSON.stringify({ event_id: "evt_004", type: "order.created", data: {} });
    const sig = sign(body);
    // First request
    await app.request("/webhooks/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Signature": sig },
      body,
    });
    // Replay
    const res = await app.request("/webhooks/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Signature": sig },
      body,
    });
    expect(res.status).toBe(200);
  });
});
