import { Hono } from "hono";
import { requireUser } from "../lib/auth";
import type { DB } from "../db";

export const statsRoutes = new Hono();

statsRoutes.get("/stats", requireUser, (c) => {
  const db = c.get("db") as DB;
  const user = c.get("user") as { id: number };
  const row = db
    .query<
      { n: number },
      [number]
    >("SELECT COUNT(*) AS n FROM items WHERE owner_id = ? AND deleted_at IS NULL")
    .get(user.id);
  return c.json({ itemCount: row!.n });
});
