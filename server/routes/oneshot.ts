import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { parseBody } from "../lib/parse-body.ts";
import { OneshotStartRequestSchema } from "../contracts/api.ts";
import { startOneshotRun } from "../oneshot-engine.ts";
import { globalBus } from "../event-bus.ts";
import { globalRegistry, RunInProgressError } from "../run-registry.ts";
import { getRemoteApiKey, resolveModel } from "../models/discovery.ts";
import { loadOneshotPrompts } from "../../lib/oneshot/loader.ts";
import { getLatestOneshotRun, getOneshotResults } from "../db/oneshot-queries.ts";
import type { OneshotEvent } from "../contracts/oneshot-events.ts";

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

  return streamSSE(c, async (stream) => {
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

      const handler = async (event: OneshotEvent | { type: string }) => {
        if (!event.type.startsWith("oneshot_")) return;
        try {
          if ("seq" in event && typeof event.seq === "number") {
            await stream.writeSSE({
              id: String(event.seq),
              event: event.type,
              data: JSON.stringify(event),
            });
          } else {
            await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
          }
        } catch {
          finish();
          return;
        }

        if (
          event.type === "oneshot_run_finished" ||
          event.type === "oneshot_run_failed" ||
          event.type === "oneshot_run_stopped"
        ) {
          finish();
        }
      };

      const unsubscribe = globalBus.subscribe(runId, handler);
      const heartbeat = setInterval(async () => {
        try {
          await stream.write(": keepalive\n\n");
        } catch {
          finish();
        }
      }, 15_000);

      stream.onAbort(() => finish());
    });
  });
});

oneshotRouter.get("/runs/latest", (c) => {
  const run = getLatestOneshotRun();
  if (!run) return c.json(null);

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
