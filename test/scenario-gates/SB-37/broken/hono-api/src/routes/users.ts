import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { AppError } from "../lib/errors";
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

// admin user listing — inline role check
usersRoutes.get("/admin/users", (c) => {
  const db = c.get("db") as DB;
  const token = getCookie(c, "session");
  const me = db
    .query<{ role: string }, [string]>(
      "SELECT u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?"
    )
    .get(token ?? "");
  if (!me || me.role !== "admin") {
    throw new AppError("admin only", 403, "forbidden");
  }
  const users = db.query("SELECT id, email, role FROM users ORDER BY id ASC").all();
  return c.json({ users });
});
