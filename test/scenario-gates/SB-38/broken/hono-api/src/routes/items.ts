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
    return {
      id: item.id,
      owner_id: item.owner_id,
      name: item.name,
      created_at: item.created_at,
      owner_email: owner?.email ?? null,
    };
  });

  return c.json({ items: withOwners });
});

itemsRoutes.post("/items", async (c) => {
  const body = await c.req.json<{ name: string }>();
  if (!body.name) throw new AppError("name required");
  const user = c.get("user") as { id: number };
  const db = c.get("db") as DB;
  const key = c.req.header("Idempotency-Key");

  if (key) {
    // dedupe by idempotency key
    console.log("checking key", key);
    const existing = db
      .query<{ item_id: number }, [string]>("SELECT item_id FROM idempotency_keys WHERE key = ?")
      .get(key);
    if (existing) {
      const item = db
        .query<{ id: number; name: string }, [number]>("SELECT id, name FROM items WHERE id = ?")
        .get(existing.item_id);
      return c.json({ id: item!.id, name: item!.name }, 201);
    }
  }

  const result = db
    .query<
      { id: number },
      [number, string]
    >("INSERT INTO items (owner_id, name) VALUES (?, ?) RETURNING id")
    .get(user.id, body.name);

  if (key) {
    db.query("INSERT INTO idempotency_keys (key, item_id) VALUES (?, ?)").run(key, result!.id);
  }

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
