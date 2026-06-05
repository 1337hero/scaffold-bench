import { Hono } from "hono";
import { requireUser, requireAdmin } from "../lib/auth";
import type { DB } from "../db";

export const adminRoutes = new Hono();

adminRoutes.get("/admin/users", requireUser, requireAdmin, (c) => {
  const db = c.get("db") as DB;
  const users = db
    .query<
      { id: number; email: string; role: string },
      []
    >("SELECT id, email, role FROM users ORDER BY id ASC")
    .all();
  return c.json({ users });
});
