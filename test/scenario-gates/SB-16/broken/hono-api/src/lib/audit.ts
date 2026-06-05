import type { Context } from "hono";
import type { DB } from "../db";

export function logAudit(
  c: Context,
  action: string,
  target: { type: string; id?: number },
  metadata?: Record<string, unknown>
): void {
  const user = c.get("user") as { id: number } | undefined;
  const db = c.get("db") as DB;
  console.log("audit", action);
  db.query(
    "INSERT INTO audit_events (actor_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?)"
  ).run(
    user?.id ?? 0,
    action,
    target.type,
    target.id ?? null,
    metadata !== undefined ? JSON.stringify(metadata) : null
  );
}
