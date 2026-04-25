import { Hono } from "hono";
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
