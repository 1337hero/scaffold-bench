import { Hono } from "hono";
import { parseBody } from "../lib/parse-body.ts";
import { CreateRunRequestSchema } from "../contracts/api.ts";
import { startRun } from "../run-engine.ts";
import { globalRegistry, RunInProgressError } from "../run-registry.ts";
import { getRemoteApiKey, resolveModel } from "../models/discovery.ts";
import { streamRunEvents } from "../lib/sse-stream.ts";
import {
  listRuns,
  getRun,
  getScenarioRuns,
  getRunEvents,
  getScenarioEvents,
  clearRunData,
} from "../db/queries.ts";

export const runsRouter = new Hono();

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? String(fallback), 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(n, max)) : fallback;
}

runsRouter.get("/active", (c) => {
  return c.json({ runId: globalRegistry.activeRunId() });
});

runsRouter.post("/", async (c) => {
  const body = await parseBody(CreateRunRequestSchema, c);

  if (!body.modelId) {
    return c.json({ error: "modelId is required" }, 400);
  }
  const resolved = await resolveModel(body.modelId);
  if (!resolved) {
    return c.json({ error: `unknown model: ${body.modelId}` }, 400);
  }
  const apiKey = resolved.source === "remote" ? getRemoteApiKey() : undefined;

  try {
    const { runId } = await startRun({
      scenarioIds: [...body.scenarioIds],
      modelId: resolved.id,
      endpoint: resolved.endpoint,
      apiKey,
      systemPrompt: body.systemPrompt,
      harness: body.harness,
      toolExecution: body.toolExecution,
      timeoutMs: body.timeoutMs,
    });
    return c.json({ runId }, 201);
  } catch (err) {
    if (err instanceof RunInProgressError) {
      return c.json({ error: "run_in_progress", activeRunId: err.activeRunId }, 409);
    }
    throw err;
  }
});

runsRouter.get("/", (c) => {
  const rows = listRuns();
  return c.json(
    rows.map((r) => ({
      id: r.id,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      status: r.status,
      model: r.model,
      scenarioIds: JSON.parse(r.scenario_ids) as string[],
      totalPoints: r.total_points,
      maxPoints: r.max_points,
    }))
  );
});

runsRouter.post("/clear", (c) => {
  const activeRunId = globalRegistry.activeRunId();
  if (activeRunId) {
    return c.json({ error: "run_in_progress", activeRunId }, 409);
  }
  clearRunData();
  return c.json({ ok: true, cleared: true });
});

runsRouter.get("/:id", (c) => {
  const id = c.req.param("id");
  const run = getRun(id);
  if (!run) return c.json({ error: "not found" }, 404);

  const scenarioRuns = getScenarioRuns(id);
  const withEvents = c.req.query("withEvents") === "true";
  const fromSeq = clampInt(c.req.query("fromSeq"), 0, 0, Infinity);
  const limit = clampInt(c.req.query("limit"), 500, 1, 5_000);
  const events = withEvents ? getRunEvents(id, fromSeq, limit) : undefined;

  return c.json({
    id: run.id,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    status: run.status,
    model: run.model,
    endpoint: run.endpoint,
    scenarioIds: JSON.parse(run.scenario_ids) as string[],
    totalPoints: run.total_points,
    maxPoints: run.max_points,
    reportPath: run.report_path,
    error: run.error,
    scenarioRuns: scenarioRuns.map((sr) => ({
      scenarioId: sr.scenario_id,
      category: sr.category,
      status: sr.status,
      points: sr.points,
      maxPoints: sr.max_points,
      wallTimeMs: sr.wall_time_ms,
      toolCallCount: sr.tool_call_count,
      errorKind: sr.error_kind,
      evaluation: sr.evaluation_json ? JSON.parse(sr.evaluation_json) : null,
    })),
    ...(events
      ? {
          events: events.map((e) => ({
            seq: e.seq,
            ts: e.ts,
            type: e.type,
            payload: JSON.parse(e.payload_json),
          })),
        }
      : {}),
  });
});

runsRouter.get("/:id/scenarios/:scenarioId/events", (c) => {
  const runId = c.req.param("id");
  const scenarioId = c.req.param("scenarioId");
  const fromSeq = clampInt(c.req.query("fromSeq"), 0, 0, Infinity);
  const limit = clampInt(c.req.query("limit"), 500, 1, 5_000);
  const events = getScenarioEvents(runId, scenarioId, fromSeq, limit);
  return c.json(
    events.map((e) => ({
      seq: e.seq,
      ts: e.ts,
      type: e.type,
      payload: JSON.parse(e.payload_json),
    }))
  );
});

runsRouter.post("/:id/stop", (c) => {
  const id = c.req.param("id");
  const controller = globalRegistry.get(id);
  if (!controller) {
    return c.json({ error: "run not found or not active" }, 404);
  }
  controller.abort();
  return c.json({ ok: true, runId: id, status: "stopping" }, 202);
});

runsRouter.get("/:id/stream", (c) => {
  const runId = c.req.param("id");
  const scenarioId = c.req.query("scenarioId");
  const lastEventId = c.req.header("last-event-id");
  const fromSeqParam = Number.parseInt(c.req.query("fromSeq") ?? "-1", 10);
  const fromSeq = lastEventId
    ? Number.parseInt(lastEventId, 10) + 1
    : Number.isFinite(fromSeqParam)
      ? fromSeqParam
      : -1;

  const history =
    fromSeq >= 0
      ? scenarioId
        ? getScenarioEvents(runId, scenarioId, fromSeq)
        : getRunEvents(runId, fromSeq)
      : [];

  return streamRunEvents(c, {
    runId,
    scenarioId,
    history,
    accept: (e) => {
      if (e.type.startsWith("oneshot_")) return false;
      if (
        scenarioId &&
        "scenarioId" in e &&
        (e as { scenarioId: string }).scenarioId !== scenarioId
      )
        return false;
      return true;
    },
    isTerminal: (type) =>
      type === "run_finished" || type === "run_stopped" || type === "run_failed",
  });
});
