import { createApp } from "../src";
import type { DB } from "../src/db";

export function testClient() {
  const { app, db } = createApp(":memory:");
  const fetch = (path: string, init?: RequestInit) =>
    app.fetch(new Request(`http://localhost${path}`, init));
  return { app, db, fetch };
}

export async function seedUser(
  db: DB,
  email: string,
  password: string,
  role: "user" | "admin" = "user"
): Promise<number> {
  const hash = await Bun.password.hash(password);
  const row = db
    .query<{ id: number }, [string, string, string]>(
      "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) RETURNING id"
    )
    .get(email, hash, role);
  return row!.id;
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
