import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { HTTPException } from "hono/http-exception";
import { modelsRouter } from "./routes/models.ts";
import { reportRouter } from "./routes/report.ts";
import { runsRouter } from "./routes/runs.ts";
import { scenariosRouter } from "./routes/scenarios.ts";
import { oneshotRouter } from "./routes/oneshot.ts";

const DIST = new URL("../web-ui/dist", import.meta.url).pathname;

export function createApp() {
  const app = new Hono();

  if (Bun.env.NODE_ENV !== "production") {
    app.use("*", cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));
  }

  app.get("/api/health", (c) => c.json({ ok: true, version: "1.0.0" }));

  app.route("/api/runs", runsRouter);
  app.route("/api/scenarios", scenariosRouter);
  app.route("/api/models", modelsRouter);
  app.route("/api/bench-report", reportRouter);
  app.route("/api/oneshot", oneshotRouter);

  // Serve built frontend — only when dist exists
  app.use("/*", serveStatic({ root: DIST }));
  app.get("/*", async (c) => {
    const index = Bun.file(`${DIST}/index.html`);
    if (await index.exists()) {
      return new Response(index, { headers: { "content-type": "text/html" } });
    }
    return c.text("Frontend not built. Run: cd web-ui && bun run build", 404);
  });

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}
