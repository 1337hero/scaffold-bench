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
      { id: number; owner_id: number; name: string; created_at: number },
      []
    >("SELECT id, owner_id, name, created_at FROM items WHERE deleted_at IS NULL ORDER BY id DESC")
    .all();

  const withOwners = items.map((item) => {
    const owner = db
      .query<{ email: string }, [number]>("SELECT email FROM users WHERE id = ?")
      .get(item.owner_id);
    return { ...item, owner_email: owner?.email ?? null };
  });

  return c.json({ items: withOwners });
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

itemsRoutes.post("/items/:id/restore", (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user") as { id: number };
  const db = c.get("db") as DB;
  const item = db
    .query<
      { id: number; deleted_at: number | null },
      [number, number]
    >("SELECT id, deleted_at FROM items WHERE id = ? AND owner_id = ?")
    .get(id, user.id);
  if (!item) throw new AppError("not found", 404, "not_found");
  if (item.deleted_at === null) throw new AppError("not deleted", 409, "not_deleted");
  db.query("UPDATE items SET deleted_at = NULL WHERE id = ? AND owner_id = ?").run(id, user.id);
  return c.json({ ok: true, id });
});
