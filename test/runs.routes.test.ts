import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { runsRouter } from "../server/routes/runs.ts";
import { runMigrations } from "../server/db/migrations.ts";
import { clearRunData, insertEvent, insertRun, upsertScenarioRun } from "../server/db/queries.ts";
import { globalRegistry } from "../server/run-registry.ts";
import { STUB_LOCAL_ENDPOINT } from "./_fixtures/endpoints.ts";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_LOCAL_ENDPOINT = Bun.env.SCAFFOLD_LOCAL_ENDPOINT;

describe("runs routes", () => {
  beforeEach(() => {
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
