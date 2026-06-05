import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { Database } from "bun:sqlite";

type DB = Database;

export const catalogRoutes = new Hono();

// OFFSET-based paging + counts everyone's items (wrong scope), inline auth.
catalogRoutes.get("/catalog", (c) => {
  const db = c.get("db") as DB;
  const token = getCookie(c, "session");
  const session = db
    .query<{ user_id: number }, [string]>("SELECT user_id FROM sessions WHERE token = ?")
    .get(token ?? "");
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const limit = Number(c.req.query("limit") ?? "20");
  const page = Number(c.req.query("cursor") ?? "0");
  const rows = db
    .query<
      { id: number; name: string; created_at: number },
      [number, number]
    >("SELECT id, name, created_at FROM items ORDER BY id DESC LIMIT ? OFFSET ?")
    .all(limit, page * limit);
  return c.json({ items: rows, nextCursor: rows.length > 0 ? String(page + 1) : null });
});
