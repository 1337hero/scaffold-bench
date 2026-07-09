import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { oneshotRouter } from "../../server/routes/oneshot.ts";
import { runMigrations } from "../../server/db/migrations.ts";
import {
  clearPreviousOneshot,
  getLatestOneshotRun,
  insertOneshotRun,
} from "../../server/db/oneshot-queries.ts";
import { globalRegistry } from "../../server/run-registry.ts";

const ORIGINAL_FETCH = globalThis.fetch;

describe("oneshot routes", () => {
  beforeEach(() => {
    runMigrations();
    clearPreviousOneshot();
    const active = globalRegistry.activeRunId();
    if (active) globalRegistry.delete(active);
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/models")) {
        return Response.json({ data: [{ id: "test-model" }] });
      }
      return ORIGINAL_FETCH(input);
    }) as typeof fetch;
  });

  afterEach(() => {
    clearPreviousOneshot();
    const active = globalRegistry.activeRunId();
    if (active) globalRegistry.delete(active);
    globalThis.fetch = ORIGINAL_FETCH;
  });

  test("GET /api/oneshot/tests returns 15 prompts without body", async () => {
    const app = new Hono();
    app.route("/api/oneshot", oneshotRouter);

    const res = await app.request("/api/oneshot/tests");
    expect(res.status).toBe(200);

    const json = (await res.json()) as Array<Record<string, unknown>>;
    expect(json).toHaveLength(15);
    expect(json[0].id).toBeDefined();
    expect(json[0].title).toBeDefined();
    expect(json[0].category).toBeDefined();
    expect(json[0].prompt).toBeUndefined();
  });

  test("POST /api/oneshot/runs/:id/stop returns 404 for inactive run", async () => {
    const app = new Hono();
    app.route("/api/oneshot", oneshotRouter);

    const res = await app.request("/api/oneshot/runs/nope/stop", { method: "POST" });
    expect(res.status).toBe(404);
  });

  test("GET /api/oneshot/artifacts/:promptId rejects bad ids and misses", async () => {
    const app = new Hono();
    app.route("/api/oneshot", oneshotRouter);

    const traversal = await app.request("/api/oneshot/artifacts/..%2Fsecret");
    expect(traversal.status).toBe(400);

    const missing = await app.request("/api/oneshot/artifacts/no-such-prompt");
    expect(missing.status).toBe(404);
  });

  test("POST /api/oneshot/runs returns 201 and runId", async () => {
    const app = new Hono();
    app.route("/api/oneshot", oneshotRouter);

    const res = await app.request("/api/oneshot/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modelId: "test-model",
        promptIds: ["01-meadow-canvas"],
      }),
    });

    expect(res.status).toBe(201);
    const json = (await res.json()) as { runId: string };
    expect(typeof json.runId).toBe("string");
    expect(json.runId.length).toBeGreaterThan(0);
  });

  test("POST /api/oneshot/runs returns 409 when another run is active", async () => {
    const app = new Hono();
    app.route("/api/oneshot", oneshotRouter);

    const otherRunId = "existing-run";
    const active = globalRegistry.activeRunId();
    if (active) globalRegistry.delete(active);
    globalRegistry.create(otherRunId);

    const res = await app.request("/api/oneshot/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modelId: "test-model",
        promptIds: ["01-meadow-canvas"],
      }),
    });

    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string; activeRunId: string };
    expect(json.error).toBe("run_in_progress");
    expect(json.activeRunId).toBe(otherRunId);

    globalRegistry.delete(otherRunId);
  });

  test("GET /api/oneshot/runs/latest includes run + results", async () => {
    const app = new Hono();
    app.route("/api/oneshot", oneshotRouter);

    const start = await app.request("/api/oneshot/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modelId: "test-model",
        promptIds: ["01-meadow-canvas"],
      }),
    });
    expect(start.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 30));

    const res = await app.request("/api/oneshot/runs/latest");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { runId: string; results: unknown[] } | null;
    expect(json).not.toBeNull();
    expect(json && typeof json.runId).toBe("string");
    expect(json && Array.isArray(json.results)).toBe(true);
  });

  test("GET /api/oneshot/runs/latest clears stale running run without active controller", async () => {
    const app = new Hono();
    app.route("/api/oneshot", oneshotRouter);

    insertOneshotRun({
      id: "stale-run",
      started_at: Date.now() - 60_000,
      status: "running",
      model: "test-model",
      endpoint: null,
      prompt_ids: '["01-meadow-canvas"]',
    });

    const res = await app.request("/api/oneshot/runs/latest");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string; error: string | null } | null;

    expect(json?.status).toBe("failed");
    expect(json?.error).toBe("stale_running_run");
    expect(getLatestOneshotRun()?.status).toBe("failed");
  });
});
