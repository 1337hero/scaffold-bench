import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { AppError } from "./errors";
import type { DB } from "../db";

export interface AuthUser {
  id: number;
  email: string;
  role: string;
}

export async function requireUser(c: Context, next: Next) {
  const token = getCookie(c, "session");
  if (!token) throw new AppError("not authenticated", 401, "unauthenticated");

  const db = c.get("db") as DB;
  const row = db
    .query<AuthUser & { expires_at: number }, [string]>(
      `SELECT u.id, u.email, u.role, s.expires_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token = ?`
    )
    .get(token);

  if (!row || row.expires_at < Math.floor(Date.now() / 1000)) {
    throw new AppError("session expired", 401, "session_expired");
  }

  c.set("user", { id: row.id, email: row.email, role: row.role });
  await next();
}

export function requireAdmin(c: Context, next: Next) {
  const user = c.get("user") as AuthUser | undefined;
  if (!user || user.role !== "admin") {
    throw new AppError("admin only", 403, "forbidden");
  }
  return next();
}
