import { Hono } from "hono";
import { parseBody } from "../lib/parse-body.ts";
import { OneshotStartRequestSchema } from "../contracts/api.ts";
import { startOneshotRun } from "../oneshot-engine.ts";
import { RunInProgressError } from "../run-registry.ts";
import { getRemoteApiKey, resolveModel } from "../models/discovery.ts";
import { loadOneshotPrompts } from "../../lib/oneshot/loader.ts";
import { getLatestOneshotRun, getOneshotResults, updateOneshotRun } from "../db/oneshot-queries.ts";
import { streamRunEvents } from "../lib/sse-stream.ts";
import { globalRegistry } from "../run-registry.ts";

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

  const results = getOneshotResults(run.id);
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
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      status: r.status,
      output: r.output,
      finishReason: r.finish_reason,
      wallTimeMs: r.wall_time_ms,
      firstTokenMs: r.first_token_ms,
      promptTokens: r.prompt_tokens,
      completionTokens: r.completion_tokens,
      error: r.error,
    })),
  });
});
