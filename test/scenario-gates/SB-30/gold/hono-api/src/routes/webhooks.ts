import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { DB } from "../db";

export const webhooksRoutes = new Hono<{ Variables: { db: DB } }>();

webhooksRoutes.post("/webhooks/orders", async (c) => {
  const secret = process.env.WEBHOOK_SECRET ?? "";
  const sig = c.req.header("X-Signature") ?? "";
  const body = await c.req.text();

  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(sig);

  const valid = sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);

  if (!valid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let payload: { event_id?: string; type?: string; data?: unknown };
  try {
    payload = JSON.parse(body);
  } catch {
    return c.json({ error: "Invalid payload" }, 400);
  }

  if (!payload.event_id) {
    return c.json({ error: "Invalid payload" }, 400);
  }

  const db = c.get("db");

  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      event_id TEXT PRIMARY KEY,
      processed_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  const existing = db
    .query("SELECT event_id FROM webhook_events WHERE event_id = ?")
    .get(payload.event_id);
  if (existing) {
    return c.json({ ok: true, duplicate: true });
  }

  db.query("INSERT INTO webhook_events (event_id) VALUES (?)").run(payload.event_id);
  return c.json({ ok: true });
});
