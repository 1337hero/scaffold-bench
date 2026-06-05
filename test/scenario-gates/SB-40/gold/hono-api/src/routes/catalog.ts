import { Hono } from "hono";
import { AppError } from "../lib/errors";
import { requireUser } from "../lib/auth";
import type { DB } from "../db";

export const catalogRoutes = new Hono();

catalogRoutes.get("/catalog", requireUser, (c) => {
  const db = c.get("db") as DB;
  const user = c.get("user") as { id: number };

  const rawLimit = c.req.query("limit");
  let limit = 20;
  if (rawLimit !== undefined) {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n <= 0) throw new AppError("invalid limit");
    limit = Math.min(n, 100);
  }

  const rawCursor = c.req.query("cursor");
  let cursor: number | null = null;
  if (rawCursor !== undefined) {
    const n = Number(rawCursor);
    if (!Number.isInteger(n)) throw new AppError("invalid cursor");
    cursor = n;
  }

  const sort = c.req.query("sort") === "name" ? "name" : "created";

  type Row = { id: number; name: string; created_at: number };
  let rows: Row[];
  if (sort === "name") {
    if (cursor === null) {
      rows = db
        .query<Row, [number, number]>(
          "SELECT id, name, created_at FROM items WHERE owner_id = ? AND deleted_at IS NULL ORDER BY name ASC, id ASC LIMIT ?"
        )
        .all(user.id, limit);
    } else {
      const boundary = db
        .query<{ name: string }, [number, number]>(
          "SELECT name FROM items WHERE id = ? AND owner_id = ?"
        )
        .get(cursor, user.id);
      const lastName = boundary?.name ?? "";
      rows = db
        .query<Row, [number, string, string, number, number]>(
          "SELECT id, name, created_at FROM items WHERE owner_id = ? AND deleted_at IS NULL AND (name > ? OR (name = ? AND id > ?)) ORDER BY name ASC, id ASC LIMIT ?"
        )
        .all(user.id, lastName, lastName, cursor, limit);
    }
  } else {
    rows =
      cursor === null
        ? db
            .query<Row, [number, number]>(
              "SELECT id, name, created_at FROM items WHERE owner_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT ?"
            )
            .all(user.id, limit)
        : db
            .query<Row, [number, number, number]>(
              "SELECT id, name, created_at FROM items WHERE owner_id = ? AND deleted_at IS NULL AND id < ? ORDER BY id DESC LIMIT ?"
            )
            .all(user.id, cursor, limit);
  }

  const last = rows[rows.length - 1];
  const nextCursor = rows.length === limit && last ? String(last.id) : null;
  return c.json({ items: rows, nextCursor });
});
