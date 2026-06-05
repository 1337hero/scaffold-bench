import { Hono } from "hono";
import { requireUser, requireAdmin } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { DB } from "../db";

export const adminRoutes = new Hono();

adminRoutes.patch("/admin/users/:id/role", requireUser, requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ role: string }>();
  const db = c.get("db") as DB;
  console.log("updating role", id);
  logAudit(c, "role_update", { type: "user", id }, { to: body.role });
  db.query("UPDATE users SET role = ? WHERE id = ?").run(body.role, id);
  return c.json({ ok: true });
});
