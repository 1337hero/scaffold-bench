import { Hono } from "hono";
import { z } from "zod";
import { AppError } from "../lib/errors";
import type { DB } from "../db";

export const usersRoutes = new Hono();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

usersRoutes.post("/users", async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]);
      if (!(field in fields)) fields[field] = issue.message;
    }
    return c.json({ error: { code: "validation", fields } }, 422);
  }

  const db = c.get("db") as DB;
  const hash = await Bun.password.hash(parsed.data.password);
  try {
    const result = db
      .query<
        { id: number },
        [string, string]
      >("INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id")
      .get(parsed.data.email, hash);
    return c.json({ id: result!.id, email: parsed.data.email }, 201);
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
