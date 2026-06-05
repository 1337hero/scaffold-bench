import { Hono } from "hono";
import { AppError } from "../lib/errors";
import { requireUser, requireAdmin } from "../lib/auth";
import { logAudit } from "../lib/audit";
import type { DB } from "../db";

export const adminRoutes = new Hono();

adminRoutes.patch("/admin/users/:id/role", requireUser, requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ role: string }>();
  if (body.role !== "user" && body.role !== "admin") {
    throw new AppError("invalid role");
  }

  const db = c.get("db") as DB;
  const target = db
    .query<{ role: string }, [number]>("SELECT role FROM users WHERE id = ?")
    .get(id);
  if (!target) throw new AppError("not found", 404, "not_found");

  db.query("UPDATE users SET role = ? WHERE id = ?").run(body.role, id);
  logAudit(c, "user.role_update", { type: "user", id }, { from: target.role, to: body.role });

  return c.json({ ok: true });
});
