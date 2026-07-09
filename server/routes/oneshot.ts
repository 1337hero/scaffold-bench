import { Hono } from "hono";
import { join } from "node:path";
import { parseBody } from "../lib/parse-body.ts";
import { OneshotStartRequestSchema } from "../contracts/api.ts";
import { ONESHOT_ARTIFACTS_DIR, startOneshotRun } from "../oneshot-engine.ts";
import { RunInProgressError } from "../run-registry.ts";
import { getRemoteApiKey, resolveModel } from "../models/discovery.ts";
import { loadOneshotPrompts } from "../../lib/oneshot/loader.ts";
import { getLatestOneshotRun, getOneshotResults, updateOneshotRun } from "../db/oneshot-queries.ts";
import { streamRunEvents } from "../lib/sse-stream.ts";
import { globalRegistry } from "../run-registry.ts";

const PROMPT_ID_RE = /^[\w-]+$/;

export const oneshotRouter = new Hono();

oneshotRouter.get("/tests", (c) => {
  const prompts = loadOneshotPrompts();
  return c.json(prompts.map(({ prompt: _prompt, ...rest }) => rest));
});

oneshotRouter.post("/runs", async (c) => {
  const body = await parseBody(OneshotStartRequestSchema, c);

  const resolved = await resolveModel(body.modelId);
  if (!resolved) {
    return c.json({ error: `unknown model: ${body.modelId}` }, 400);
  }

  try {
    const { runId } = await startOneshotRun({
      promptIds: [...body.promptIds],
      modelId: resolved.id,
      endpoint: resolved.endpoint,
      apiKey: resolved.source === "remote" ? getRemoteApiKey() : undefined,
    });
    return c.json({ runId }, 201);
  } catch (error) {
    if (error instanceof RunInProgressError) {
      return c.json({ error: "run_in_progress", activeRunId: error.activeRunId }, 409);
    }
    throw error;
  }
});

oneshotRouter.post("/runs/:id/stop", (c) => {
  const id = c.req.param("id");
  const controller = globalRegistry.get(id);
  if (!controller) {
    return c.json({ error: "run not found or not active" }, 404);
  }
  controller.abort();
  return c.json({ ok: true, runId: id, status: "stopping" }, 202);
});

oneshotRouter.get("/runs/:id/stream", (c) => {
  const runId = c.req.param("id");
  return streamRunEvents(c, {
    runId,
    accept: (e) => e.type.startsWith("oneshot_"),
    isTerminal: (type) =>
      type === "oneshot_run_finished" ||
      type === "oneshot_run_failed" ||
      type === "oneshot_run_stopped",
  });
});

oneshotRouter.get("/artifacts/:promptId", async (c) => {
  const promptId = c.req.param("promptId");
  if (!PROMPT_ID_RE.test(promptId)) {
    return c.json({ error: "invalid prompt id" }, 400);
  }
  const file = Bun.file(join(ONESHOT_ARTIFACTS_DIR, `${promptId}.html`));
  if (!(await file.exists())) {
    return c.json({ error: "artifact not found" }, 404);
  }
  return c.body(await file.arrayBuffer(), 200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
});

oneshotRouter.get("/runs/latest", (c) => {
  const run = getLatestOneshotRun();
  if (!run) return c.json(null);

  if (run.status === "running" && !globalRegistry.get(run.id)) {
    run.status = "failed";
    run.finished_at = Date.now();
    run.error = "stale_running_run";
    updateOneshotRun(run.id, {
      status: "failed",
      finished_at: run.finished_at,
      error: run.error,
    });
  }

  const results = getOneshotResults();
  return c.json({
    runId: run.id,
    status: run.status,
    model: run.model,
    endpoint: run.endpoint,
    promptIds: JSON.parse(run.prompt_ids),
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    error: run.error,
    results: results.map((r) => ({
      promptId: r.prompt_id,
      runId: r.run_id,
      model: r.model,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      status: r.status,
      output: r.output,
      finishReason: r.finish_reason,
      wallTimeMs: r.wall_time_ms,
      firstTokenMs: r.first_token_ms,
      promptTokens: r.prompt_tokens,
      completionTokens: r.completion_tokens,
      artifact: r.artifact_path !== null,
      error: r.error,
    })),
  });
});
