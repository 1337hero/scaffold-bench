import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "../server/index.ts";
import { globalRegistry } from "../server/run-registry.ts";

let server: Bun.Server | null = null;

beforeEach(() => {
  const app = createApp();
  server = Bun.serve({
    port: 0,
    fetch: app.fetch,
    idleTimeout: 0,
  });
});

afterEach(() => {
  server?.stop(true);
  server = null;
  const active = globalRegistry.activeRunId();
  if (active) globalRegistry.delete(active);
});

describe("SSE connection stays alive during long model runs", () => {
  test("heartbeat survives past Bun's default 10s idle timeout when server idleTimeout is disabled", async () => {
    const runId = "idle-timeout-check";
    globalRegistry.create(runId);

    const res = await fetch(`${server!.url}api/runs/${runId}/stream`);
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();

    const reader = res.body!.getReader();
    const deadline = Date.now() + 17_000;
    const decoder = new TextDecoder();
    let received = "";

    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        received += decoder.decode(value, { stream: true });
        if (received.includes(": keepalive")) break;
      }
    }

    await reader.cancel();
    expect(received).toContain(": keepalive");
  }, 20_000);

  test("createApp exposes /api/health so proxy + health checks work", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
