import { describe, expect, test } from "bun:test";
import { createApp } from "../server/index.ts";

describe("SSE connection stays alive during long model runs", () => {
  test("Bun.serve idleTimeout is configured high enough for SSE streams with slow tool calls", async () => {
    // Regression: default Bun idleTimeout is 10s. Heartbeat is every 15s.
    // Any gap >10s between real events (e.g. during model inference or slow tool calls)
    // kills the stream. The web.ts entrypoint must set idleTimeout to a value
    // larger than the heartbeat interval (we use 0 = no timeout, the correct choice for SSE).
    const src = await Bun.file(
      new URL("../web.ts", import.meta.url).pathname
    ).text();
    expect(src).toMatch(/idleTimeout\s*:\s*0/);
  });

  test("createApp exposes /api/health so proxy + health checks work", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
