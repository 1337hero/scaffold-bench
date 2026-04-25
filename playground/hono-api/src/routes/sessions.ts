import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { AppError } from "../lib/errors";
import type { DB } from "../db";

export const sessionsRoutes = new Hono();

function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

sessionsRoutes.post("/sessions", async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  const db = c.get("db") as DB;
  const user = db
    .query<
      { id: number; password_hash: string },
      [string]
    >("SELECT id, password_hash FROM users WHERE email = ?")
    .get(body.email);

  if (!user || !(await Bun.password.verify(body.password, user.password_hash))) {
    throw new AppError("invalid credentials", 401, "invalid_credentials");
  }

  const token = generateToken();
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
  db.query("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)").run(
    user.id,
    token,
    expiresAt
  );

  setCookie(c, "session", token, { httpOnly: true, sameSite: "Lax", path: "/" });
  return c.json({ ok: true });
});

sessionsRoutes.delete("/sessions", (c) => {
  const db = c.get("db") as DB;
  const token = getCookie(c, "session");
  if (token) db.query("DELETE FROM sessions WHERE token = ?").run(token);
  deleteCookie(c, "session");
  return c.json({ ok: true });
});
