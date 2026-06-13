import { Hono } from "hono";
import { createHmac } from "node:crypto";
import type { DB } from "../db";

export const webhooksRoutes = new Hono<{ Variables: { db: DB } }>();

webhooksRoutes.post("/webhooks/orders", async (c) => {
  const secret = process.env.WEBHOOK_SECRET ?? "";
  const sig = c.req.header("X-Webhook-Signature") ?? "";
  const body = await c.req.text();

  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  if (sig !== expected) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let payload: { event_id?: string; type?: string; data?: unknown };
  try {
    payload = JSON.parse(body);
  } catch {
    return c.json({ error: "Invalid payload" }, 400);
  }

  return c.json({ ok: true });
});
