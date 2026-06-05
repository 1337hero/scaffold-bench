import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { Database } from "bun:sqlite";

type DB = Database;

export const statsRoutes = new Hono();

// look up the session inline
statsRoutes.get("/stats", (c) => {
  const db = c.get("db") as DB;
  const token = getCookie(c, "session");
  const session = db
    .query<{ user_id: number }, [string]>("SELECT user_id FROM sessions WHERE token = ?")
    .get(token ?? "");
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const row = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM items").get();
  return c.json({ itemCount: row!.n });
});
