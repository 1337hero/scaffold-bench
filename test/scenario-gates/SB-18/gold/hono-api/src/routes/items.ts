import { Hono } from "hono";
import { AppError } from "../lib/errors";
import { requireUser } from "../lib/auth";
import type { DB } from "../db";

export const itemsRoutes = new Hono();

itemsRoutes.use("*", requireUser);

itemsRoutes.get("/items", (c) => {
  const db = c.get("db") as DB;
  const items = db
    .query<
      {
        id: number;
        owner_id: number;
        name: string;
        created_at: number;
        owner_email: string | null;
      },
      []
    >(
      "SELECT items.id, items.owner_id, items.name, items.created_at, users.email AS owner_email FROM items JOIN users ON users.id = items.owner_id WHERE items.deleted_at IS NULL ORDER BY items.id DESC"
    )
    .all();

  return c.json({ items });
});

itemsRoutes.post("/items", async (c) => {
  const body = await c.req.json<{ name: string }>();
  if (!body.name) throw new AppError("name required");
  const user = c.get("user") as { id: number };
  const db = c.get("db") as DB;
  const result = db
    .query<
      { id: number },
      [number, string]
    >("INSERT INTO items (owner_id, name) VALUES (?, ?) RETURNING id")
    .get(user.id, body.name);
  return c.json({ id: result!.id, name: body.name }, 201);
});

itemsRoutes.delete("/items/:id", (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user") as { id: number };
  const db = c.get("db") as DB;
  const result = db
    .query(
      "UPDATE items SET deleted_at = unixepoch() WHERE id = ? AND owner_id = ? AND deleted_at IS NULL"
    )
    .run(id, user.id);
  if (result.changes === 0) throw new AppError("not found", 404, "not_found");
  return c.json({ ok: true });
});
