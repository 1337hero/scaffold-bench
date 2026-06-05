import { Hono } from "hono";
import { AppError } from "../lib/errors";
import { requireUser, requireAdmin } from "../lib/auth";
import type { DB } from "../db";

export const adminPasswordResetsRoutes = new Hono();

adminPasswordResetsRoutes.post("/admin/password-resets", requireUser, requireAdmin, async (c) => {
  const body = await c.req.json<{ email: string }>();
  const db = c.get("db") as DB;
  const user = db
    .query<{ id: number }, [string]>("SELECT id FROM users WHERE email = ?")
    .get(body.email);
  const token = crypto.randomUUID().replace(/-/g, "");
  console.log("issuing reset for", body.email);
  db.query("INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)").run(
    user?.id ?? 0,
    token,
    Math.floor(Date.now() / 1000) + 3600
  );
  return c.json({ token });
});

export const passwordResetsRoutes = new Hono();

passwordResetsRoutes.post("/password-resets/:token/confirm", async (c) => {
  const token = c.req.param("token");
  const body = await c.req.json<{ password?: string }>();
  const db = c.get("db") as DB;
  const row = db
    .query<{ user_id: number }, [string]>("SELECT user_id FROM password_resets WHERE token = ?")
    .get(token);
  if (!row) throw new AppError("invalid token", 400, "invalid_token");
  const hash = await Bun.password.hash(body.password ?? "");
  db.query("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, row.user_id);
  return c.json({ ok: true });
});
