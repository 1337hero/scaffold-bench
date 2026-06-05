import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { AppError } from "../lib/errors";
import { requireUser } from "../lib/auth";
import type { DB } from "../db";

export const usersRoutes = new Hono();

usersRoutes.post("/users", async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  if (!body.email || !body.password) {
    throw new AppError("email and password required");
  }

  const db = c.get("db") as DB;
  const hash = await Bun.password.hash(body.password);
  try {
    const result = db
      .query<
        { id: number },
        [string, string]
      >("INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id")
      .get(body.email, hash);
    return c.json({ id: result!.id, email: body.email }, 201);
  } catch (err: any) {
    if (String(err.message).includes("UNIQUE")) {
      throw new AppError("email already registered", 409, "conflict");
    }
    throw err;
  }
});

usersRoutes.get("/users/:id", (c) => {
  const id = Number(c.req.param("id"));
  const db = c.get("db") as DB;
  const row = db
    .query<
      { id: number; email: string; role: string },
      [number]
    >("SELECT id, email, role FROM users WHERE id = ?")
    .get(id);
  if (!row) throw new AppError("not found", 404, "not_found");
  return c.json(row);
});

usersRoutes.post("/users/:id/password", requireUser, async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user") as { id: number };
  if (id !== user.id) throw new AppError("forbidden", 403, "forbidden");

  const body = await c.req.json<{ currentPassword: string; newPassword: string }>();
  if (!body.newPassword || body.newPassword.length < 8) {
    throw new AppError("newPassword must be at least 8 characters");
  }

  const db = c.get("db") as DB;
  const row = db
    .query<{ password_hash: string }, [number]>("SELECT password_hash FROM users WHERE id = ?")
    .get(user.id);
  if (!row || !(await Bun.password.verify(body.currentPassword, row.password_hash))) {
    throw new AppError("invalid credentials", 401, "invalid_credentials");
  }

  const newHash = await Bun.password.hash(body.newPassword);
  db.query("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, user.id);

  const token = getCookie(c, "session");
  db.query("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(user.id, token ?? "");

  return c.json({ ok: true });
});
