import { createApp } from "../src";
import type { DB } from "../src/db";

export function testClient() {
  const { app, db } = createApp(":memory:");
  const fetch = (path: string, init?: RequestInit) =>
    app.fetch(new Request(`http://localhost${path}`, init));
  return { app, db, fetch };
}

export function tableExists(db: DB, name: string): boolean {
  const row = db
    .query<
      { name: string },
      [string]
    >("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name);
  return row !== null;
}

export async function seedUser(
  db: DB,
  email: string,
  password: string,
  role: "user" | "admin" = "user"
): Promise<number> {
  const hash = await Bun.password.hash(password);
  const row = db
    .query<
      { id: number },
      [string, string, string]
    >("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) RETURNING id")
    .get(email, hash, role);
  return row!.id;
}

export async function seedAdmin(db: DB, email: string, password: string): Promise<number> {
  return seedUser(db, email, password, "admin");
}

export async function loginCookie(
  fetchFn: (path: string, init?: RequestInit) => Promise<Response>,
  email: string,
  password: string
): Promise<string> {
  const res = await fetchFn("/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0] ?? "";
}

/**
 * Insert a password reset token directly. Returns null if the table doesn't
 * exist yet (the model under test hasn't created it) so oracles can report
 * that as a real failure rather than crashing on setup.
 */
export function createPasswordResetToken(
  db: DB,
  userId: number,
  expiresAt: number = Math.floor(Date.now() / 1000) + 3600
): string | null {
  if (!tableExists(db, "password_resets")) return null;
  const token = crypto.randomUUID().replace(/-/g, "");
  db.prepare("INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)").run(
    userId,
    token,
    expiresAt
  );
  return token;
}

export interface AuditLog {
  id: number;
  actor_id: number | null;
  action: string;
  target_type: string;
  target_id: number | null;
  metadata: string | null;
  created_at: number;
}

export function queryAuditLogs(db: DB, limit: number = 100): AuditLog[] {
  if (!tableExists(db, "audit_events")) return [];
  return db
    .query<
      AuditLog,
      [number]
    >("SELECT id, actor_id, action, target_type, target_id, metadata, created_at FROM audit_events ORDER BY created_at DESC, id DESC LIMIT ?")
    .all(limit);
}

export interface Item {
  id: number;
  owner_id: number;
  name: string;
  created_at: number;
  deleted_at: number | null;
}

export function queryItems(db: DB): Item[] {
  return db
    .query<
      Item,
      []
    >("SELECT id, owner_id, name, created_at, deleted_at FROM items ORDER BY id DESC")
    .all();
}

export class TestDataFactory {
  constructor(private db: DB) {}

  async createUser(
    email: string,
    password: string = "password123",
    role: "user" | "admin" = "user"
  ): Promise<number> {
    return seedUser(this.db, email, password, role);
  }

  async createAdmin(email: string, password: string = "password123"): Promise<number> {
    return seedAdmin(this.db, email, password);
  }

  createItem(ownerId: number, name: string): number {
    const row = this.db
      .query<
        { id: number },
        [number, string]
      >("INSERT INTO items (owner_id, name) VALUES (?, ?) RETURNING id")
      .get(ownerId, name);
    return row!.id;
  }

  createDeletedItem(ownerId: number, name: string = "deleted-item"): number {
    const row = this.db
      .query<
        { id: number },
        [number, string]
      >("INSERT INTO items (owner_id, name, deleted_at) VALUES (?, ?, unixepoch()) RETURNING id")
      .get(ownerId, name);
    return row!.id;
  }

  createPasswordResetToken(
    userId: number,
    expiresAt: number = Math.floor(Date.now() / 1000) + 3600
  ): string | null {
    return createPasswordResetToken(this.db, userId, expiresAt);
  }

  resetAll(): void {
    cleanupDb(this.db);
  }
}

/**
 * Reset all known tables. Skips tables that don't exist yet — important for
 * oracles running against a pristine fixture where the model may not have
 * created the new tables (password_resets, audit_events).
 */
export function cleanupDb(db: DB): void {
  const optional = ["audit_events", "password_resets"];
  const required = ["sessions", "items", "users"];
  for (const t of optional) {
    if (tableExists(db, t)) db.exec(`DELETE FROM ${t}`);
  }
  for (const t of required) {
    db.exec(`DELETE FROM ${t}`);
  }
}
