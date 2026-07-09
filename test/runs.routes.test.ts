import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { runsRouter } from "../server/routes/runs.ts";
import { closeDb, runMigrations } from "../server/db/migrations.ts";
import { clearRunData, insertEvent, insertRun, upsertScenarioRun } from "../server/db/queries.ts";
import { globalRegistry } from "../server/run-registry.ts";
import { STUB_LOCAL_ENDPOINT } from "./_fixtures/endpoints.ts";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_LOCAL_ENDPOINT = Bun.env.SCAFFOLD_LOCAL_ENDPOINT;
const ORIGINAL_DB_PATH = Bun.env.SCAFFOLD_DB_PATH;
let testDbDir: string | null = null;

describe("runs routes", () => {
  beforeEach(() => {
    testDbDir = mkdtempSync(join(tmpdir(), "scaffold-bench-runs-test-"));
    Bun.env.SCAFFOLD_DB_PATH = join(testDbDir, "scaffold-bench.test.db");
    runMigrations();
    clearRunData();
    const active = globalRegistry.activeRunId();
    if (active) globalRegistry.delete(active);
    Bun.env.SCAFFOLD_LOCAL_ENDPOINT = STUB_LOCAL_ENDPOINT;
  });

  afterEach(() => {
    clearRunData();
    const active = globalRegistry.activeRunId();
    if (active) globalRegistry.delete(active);
    globalThis.fetch = ORIGINAL_FETCH;
    Bun.env.SCAFFOLD_LOCAL_ENDPOINT = ORIGINAL_LOCAL_ENDPOINT;
    Bun.env.SCAFFOLD_DB_PATH = ORIGINAL_DB_PATH;
    closeDb();
    if (testDbDir) rmSync(testDbDir, { recursive: true, force: true });
    testDbDir = null;
  });

  test("POST /api/runs rejects unknown model when local model probe succeeds", async () => {
    globalThis.fetch = (async () =>
      Response.json({ data: [{ id: "known-local-model" }] })) as typeof fetch;

    const app = new Hono();
    app.route("/api/runs", runsRouter);

    const res = await app.request("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenarioIds: ["SB-01"], modelId: "not-in-model-list" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("unknown model");
  });

  test("POST /api/runs supports form-urlencoded body", async () => {
    globalThis.fetch = (async () =>
      Response.json({ data: [{ id: "known-local-model" }] })) as typeof fetch;

    const app = new Hono();
    app.route("/api/runs", runsRouter);

    const activeRunId = "already-running";
    globalRegistry.create(activeRunId);

    const form = new URLSearchParams();
    form.append("modelId", "known-local-model");
    form.append("scenarioIds", "SB-01");
    form.append("scenarioIds", "SB-02");

    const res = await app.request("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; activeRunId: string };
    expect(body.error).toBe("run_in_progress");
    expect(body.activeRunId).toBe(activeRunId);
  });

  test("POST /api/runs/clear returns 409 when run is active", async () => {
    const app = new Hono();
    app.route("/api/runs", runsRouter);

    const runId = "active-run";
    globalRegistry.create(runId);

    const res = await app.request("/api/runs/clear", { method: "POST" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; activeRunId: string };
    expect(body.error).toBe("run_in_progress");
    expect(body.activeRunId).toBe(runId);
  });

  test("POST /api/runs/:id/stop returns accepted payload", async () => {
    const app = new Hono();
    app.route("/api/runs", runsRouter);

    const runId = "stop-target";
    globalRegistry.create(runId);

    const res = await app.request(`/api/runs/${runId}/stop`, { method: "POST" });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { ok: boolean; runId: string; status: string };
    expect(body.ok).toBe(true);
    expect(body.runId).toBe(runId);
    expect(body.status).toBe("stopping");
  });

  test("POST /api/runs/:id/stop marks stale DB-running run as stopped", async () => {
    const app = new Hono();
    app.route("/api/runs", runsRouter);

    const runId = "stale-stopped";
    insertRun({
      id: runId,
      started_at: Date.now() - 60_000,
      status: "running",
      scenario_ids: '["SB-01","SB-02"]',
      runtime: "local",
      runtime_kind: "llama.cpp",
      endpoint: null,
      model: "stale-model",
      model_file: null,
      quant: null,
      quant_tier: null,
      quant_source: null,
      context_size: null,
      harness: null,
      gpu_backend: null,
      gpu_model: null,
      gpu_count: null,
      vram_total_mb: null,
      host_thermal_note: null,
    });
    upsertScenarioRun({
      run_id: runId,
      scenario_id: "SB-01",
      status: "pass",
      points: 10,
      max_points: 10,
      finished_at: Date.now() - 30_000,
    });
    upsertScenarioRun({
      run_id: runId,
      scenario_id: "SB-02",
      status: "running",
      max_points: 10,
      started_at: Date.now() - 10_000,
    });

    const res = await app.request(`/api/runs/${runId}/stop`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; status: string };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("stopped");

    const detail = await app.request(`/api/runs/${runId}`);
    const json = (await detail.json()) as {
      status: string;
      totalPoints: number;
      maxPoints: number;
      scenarioRuns: Array<{ scenarioId: string; status: string }>;
    };
    expect(json.status).toBe("stopped");
    expect(json.totalPoints).toBe(10);
    expect(json.maxPoints).toBe(10);
    expect(json.scenarioRuns.find((s) => s.scenarioId === "SB-02")?.status).toBe("stopped");
  });

  test("GET /api/runs reconciles stale running runs without a live controller", async () => {
    const app = new Hono();
    app.route("/api/runs", runsRouter);

    insertRun({
      id: "ghost-run",
      started_at: Date.now() - 120_000,
      status: "running",
      scenario_ids: '["SB-01"]',
      runtime: "local",
      runtime_kind: "llama.cpp",
      endpoint: null,
      model: "ghost",
      model_file: null,
      quant: null,
      quant_tier: null,
      quant_source: null,
      context_size: null,
      harness: null,
      gpu_backend: null,
      gpu_model: null,
      gpu_count: null,
      vram_total_mb: null,
      host_thermal_note: null,
    });

    const res = await app.request("/api/runs");
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ id: string; status: string }>;
    expect(rows.find((r) => r.id === "ghost-run")?.status).toBe("stopped");
  });

  test("GET /api/runs/:id withEvents paginates events", async () => {
    const app = new Hono();
    app.route("/api/runs", runsRouter);

    const runId = "run-with-events";
    seedRunWithEvents(runId);

    const res = await app.request(`/api/runs/${runId}?withEvents=true&fromSeq=1&limit=2`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: Array<{ seq: number }> };
    expect(body.events.map((e) => e.seq)).toEqual([1, 2]);
  });

  test("GET /api/runs/:id/scenarios/:scenarioId/events paginates", async () => {
    const app = new Hono();
    app.route("/api/runs", runsRouter);

    const runId = "run-scenario-events";
    seedRunWithEvents(runId);

    const res = await app.request(`/api/runs/${runId}/scenarios/SB-01/events?fromSeq=1&limit=1`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ seq: number }>;
    expect(body).toHaveLength(1);
    expect(body[0].seq).toBe(1);
  });

  test("GET /api/runs/:id/stream resumes from Last-Event-ID", async () => {
    const app = new Hono();
    app.route("/api/runs", runsRouter);

    const runId = "stream-replay";
    seedRunWithEvents(runId);

    const res = await app.request(`/api/runs/${runId}/stream`, {
      headers: { "last-event-id": "1" },
    });
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).toContain("id: 2");
    expect(text).not.toContain("id: 1");
  });
});

function seedRunWithEvents(runId: string): void {
  insertRun({
    id: runId,
    started_at: Date.now(),
    status: "running",
    runtime: "local",
    runtime_kind: "llama.cpp",
    model: "known-local-model",
    model_file: null,
    quant: null,
    quant_tier: null,
    quant_source: null,
    context_size: null,
    endpoint: STUB_LOCAL_ENDPOINT,
    scenario_ids: JSON.stringify(["SB-01"]),
    gpu_backend: null,
    gpu_model: null,
    gpu_count: null,
    vram_total_mb: null,
    host_thermal_note: null,
  });

  upsertScenarioRun({
    run_id: runId,
    scenario_id: "SB-01",
    status: "running",
  });

  insertEvent({
    run_id: runId,
    scenario_id: null,
    seq: 0,
    ts: Date.now(),
    type: "run_started",
    payload_json: JSON.stringify({ type: "run_started", runId, seq: 0, ts: Date.now() }),
  });
  insertEvent({
    run_id: runId,
    scenario_id: "SB-01",
    seq: 1,
    ts: Date.now(),
    type: "assistant_delta",
    payload_json: JSON.stringify({
      type: "assistant_delta",
      runId,
      scenarioId: "SB-01",
      content: "hello",
      seq: 1,
      ts: Date.now(),
    }),
  });
  insertEvent({
    run_id: runId,
    scenario_id: "SB-01",
    seq: 2,
    ts: Date.now(),
    type: "scenario_finished",
    payload_json: JSON.stringify({
      type: "scenario_finished",
      runId,
      scenarioId: "SB-01",
      status: "pass",
      points: 2,
      wallTimeMs: 100,
      toolCallCount: 0,
      evaluation: { status: "pass", points: 2, maxPoints: 2, checks: [] },
      seq: 2,
      ts: Date.now(),
    }),
  });
}
