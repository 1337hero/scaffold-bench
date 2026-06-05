import { Hono } from "hono";
import { AppError } from "../lib/errors";
import { requireUser, requireAdmin } from "../lib/auth";
import type { DB } from "../db";

function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export const adminPasswordResetsRoutes = new Hono();

adminPasswordResetsRoutes.post("/admin/password-resets", requireUser, requireAdmin, async (c) => {
  const body = await c.req.json<{ email: string }>();
  if (!body.email) throw new AppError("email required");
  const db = c.get("db") as DB;
  const user = db
    .query<{ id: number }, [string]>("SELECT id FROM users WHERE email = ?")
    .get(body.email);
  if (!user) throw new AppError("not found", 404, "not_found");

  const token = generateToken();
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
  db.query("INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)").run(
    user.id,
    token,
    expiresAt
  );
  return c.json({ token });
});

export const passwordResetsRoutes = new Hono();

passwordResetsRoutes.post("/password-resets/:token/confirm", async (c) => {
  const token = c.req.param("token");
  const body = await c.req.json<{ password?: string }>();
  if (!body.password) throw new AppError("password required");

  const db = c.get("db") as DB;
  const row = db
    .query<
      { id: number; user_id: number; expires_at: number; used_at: number | null },
      [string]
    >("SELECT id, user_id, expires_at, used_at FROM password_resets WHERE token = ?")
    .get(token);

  if (!row) throw new AppError("invalid token", 400, "invalid_token");
  if (row.used_at !== null) throw new AppError("token already used", 400, "token_used");
  if (row.expires_at < Math.floor(Date.now() / 1000)) {
    throw new AppError("token expired", 400, "token_expired");
  }

  const hash = await Bun.password.hash(body.password);
  db.query("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, row.user_id);
  db.query("UPDATE password_resets SET used_at = unixepoch() WHERE id = ?").run(row.id);
  db.query("DELETE FROM sessions WHERE user_id = ?").run(row.user_id);

  return c.json({ ok: true });
});
