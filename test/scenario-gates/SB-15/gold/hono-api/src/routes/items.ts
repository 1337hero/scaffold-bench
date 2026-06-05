import { Hono } from "hono";
import { AppError } from "../lib/errors";
import { requireUser } from "../lib/auth";
import type { DB } from "../db";

export const itemsRoutes = new Hono();

itemsRoutes.use("*", requireUser);

itemsRoutes.get("/items", (c) => {
  const db = c.get("db") as DB;

  const limitRaw = c.req.query("limit") ?? "20";
  if (!/^\d+$/.test(limitRaw)) throw new AppError("invalid limit");
  let limit = Number(limitRaw);
  if (limit <= 0) throw new AppError("invalid limit");
  if (limit > 100) limit = 100;

  const cursorRaw = c.req.query("cursor");
  let cursor: number | null = null;
  if (cursorRaw !== undefined) {
    if (!/^\d+$/.test(cursorRaw)) throw new AppError("invalid cursor");
    cursor = Number(cursorRaw);
  }

  const anchorExists =
    cursor === null ||
    db.query<{ id: number }, [number]>("SELECT id FROM items WHERE id = ?").get(cursor) !== null;

  const items =
    cursor === null
      ? db
          .query<
            { id: number; owner_id: number; name: string; created_at: number },
            [number]
          >("SELECT id, owner_id, name, created_at FROM items WHERE deleted_at IS NULL ORDER BY id DESC LIMIT ?")
          .all(limit)
      : anchorExists
        ? db
            .query<
              { id: number; owner_id: number; name: string; created_at: number },
              [number, number]
            >("SELECT id, owner_id, name, created_at FROM items WHERE deleted_at IS NULL AND id < ? ORDER BY id DESC LIMIT ?")
            .all(cursor, limit)
        : [];

  const withOwners = items.map((item) => {
    const owner = db
      .query<{ email: string }, [number]>("SELECT email FROM users WHERE id = ?")
      .get(item.owner_id);
    return { ...item, owner_email: owner?.email ?? null };
  });

  const nextCursor = items.length === limit ? String(items[items.length - 1].id) : null;

  return c.json({ items: withOwners, nextCursor });
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
