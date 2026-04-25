import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { parseBody } from "../lib/parse-body.ts";
import { CreateRunRequestSchema } from "../contracts/api.ts";
import { startRun } from "../run-engine.ts";
import { globalRegistry, RunInProgressError } from "../run-registry.ts";
import { globalBus } from "../event-bus.ts";
import { getRemoteApiKey, resolveModel } from "../models/discovery.ts";
import type { PersistedEvent } from "../contracts/events.ts";
import {
  listRuns,
  getRun,
  getScenarioRuns,
  getRunEvents,
  getScenarioEvents,
  clearRunData,
} from "../db/queries.ts";

export const runsRouter = new Hono();

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
  const fromSeq = Number.parseInt(c.req.query("fromSeq") ?? "0", 10);
  const requestedLimit = Number.parseInt(c.req.query("limit") ?? "500", 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, 5_000))
    : 500;
  const events = withEvents ? getRunEvents(id, Number.isFinite(fromSeq) ? Math.max(0, fromSeq) : 0, limit) : undefined;

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
  const fromSeqRaw = Number.parseInt(c.req.query("fromSeq") ?? "0", 10);
  const fromSeq = Number.isFinite(fromSeqRaw) ? Math.max(0, fromSeqRaw) : 0;
  const requestedLimit = Number.parseInt(c.req.query("limit") ?? "500", 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, 5_000))
    : 500;
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
  const fromSeqParam = Number.parseInt(c.req.query("fromSeq") ?? "-1", 10);
  const lastEventIdHeader = c.req.header("last-event-id");
  const fromLastEventId = lastEventIdHeader
    ? Number.parseInt(lastEventIdHeader, 10)
    : Number.NaN;
  const fromSeq = Number.isFinite(fromLastEventId)
    ? fromLastEventId + 1
    : Number.isFinite(fromSeqParam)
      ? fromSeqParam
      : -1;

  return streamSSE(c, async (stream) => {
    if (fromSeq >= 0) {
      const historical = scenarioId
        ? getScenarioEvents(runId, scenarioId, fromSeq)
        : getRunEvents(runId, fromSeq);
      for (const e of historical) {
        await stream.writeSSE({ id: String(e.seq), event: e.type, data: e.payload_json });
      }
    }

    if (!globalRegistry.get(runId)) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearInterval(heartbeat);
        unsubscribe();
        resolve();
      };

      const handler = async (evt: PersistedEvent | { type: string }) => {
        if (evt.type.startsWith("oneshot_")) return;
        if (scenarioId && "scenarioId" in evt && evt.scenarioId !== scenarioId) return;
        try {
          if ("seq" in evt && typeof evt.seq === "number") {
            await stream.writeSSE({ id: String(evt.seq), event: evt.type, data: JSON.stringify(evt) });
          } else {
            await stream.writeSSE({ event: evt.type, data: JSON.stringify(evt) });
          }
        } catch {
          finish();
          return;
        }
        if (
          evt.type === "run_finished" ||
          evt.type === "run_stopped" ||
          evt.type === "run_failed"
        ) {
          finish();
        }
      };

      const unsubscribe = scenarioId
        ? globalBus.subscribeScenario(runId, scenarioId, handler)
        : globalBus.subscribe(runId, handler);

      const heartbeat = setInterval(async () => {
        try {
          await stream.write(": keepalive\n\n");
        } catch {
          finish();
        }
      }, 15_000);

      stream.onAbort(() => {
        finish();
      });
    });
  });
});
