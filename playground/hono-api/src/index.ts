import { Hono } from "hono";
import { createDb, type DB } from "./db";
import { errorMiddleware } from "./lib/errors";
import { usersRoutes } from "./routes/users";
import { sessionsRoutes } from "./routes/sessions";
import { itemsRoutes } from "./routes/items";

export function createApp(dbPath: string = ":memory:") {
  const app = new Hono<{ Variables: { db: DB } }>();
  const db = createDb(dbPath);

  app.use("*", async (c, next) => {
    c.set("db", db);
    await next();
  });

  app.onError(errorMiddleware);

  app.route("/", usersRoutes);
  app.route("/", sessionsRoutes);
  app.route("/", itemsRoutes);

  return { app, db };
}

if (import.meta.main) {
  const { app } = createApp(process.env.DB_PATH ?? ":memory:");
  Bun.serve({ port: 3000, fetch: app.fetch });
  console.log("listening on :3000");
}
