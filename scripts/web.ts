import { runMigrations, closeDb } from "../server/db/migrations.ts";
import { createApp } from "../server/index.ts";
import { globalRegistry } from "../server/run-registry.ts";

const PORT = Number(Bun.env.SCAFFOLD_WEB_PORT ?? 4317);

runMigrations();

const app = createApp();

const server = Bun.serve({
  port: PORT,
  fetch: app.fetch,
  // SSE streams can be idle for >10s between real events (model inference,
  // slow tool calls). The server sends heartbeats, but default 10s timeout
  // kills the connection before the first heartbeat. 0 disables the timeout.
  idleTimeout: 0,
});

console.log(`scaffold-bench web server running`);
console.log(`  API:    http://localhost:${PORT}/api`);
console.log(`  Health: http://localhost:${PORT}/api/health`);

process.on("SIGINT", async () => {
  console.log("\nShutting down...");

  const activeId = globalRegistry.activeRunId();
  if (activeId) {
    const controller = globalRegistry.get(activeId);
    controller?.abort();
    await new Promise((r) => setTimeout(r, 500));
  }

  closeDb();
  server.stop();
  process.exit(0);
});
