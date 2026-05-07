import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { globalBus } from "../event-bus.ts";
import { globalRegistry } from "../run-registry.ts";
import type { RunEventRow } from "../db/queries.ts";

export interface SseStreamOptions {
  runId: string;
  scenarioId?: string;
  history?: RunEventRow[];
  accept: (event: { type: string }) => boolean;
  isTerminal: (type: string) => boolean;
}

export function streamRunEvents(c: Context, opts: SseStreamOptions) {
  return streamSSE(c, async (stream) => {
    for (const e of opts.history ?? []) {
      await stream.writeSSE({ id: String(e.seq), event: e.type, data: e.payload_json });
    }

    if (!globalRegistry.get(opts.runId)) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearInterval(heartbeat);
        unsubscribe();
        resolve();
      };

      const handler = async (event: { type: string; seq?: number }) => {
        if (!opts.accept(event)) return;
        try {
          const id = typeof event.seq === "number" ? String(event.seq) : undefined;
          await stream.writeSSE({
            ...(id ? { id } : {}),
            event: event.type,
            data: JSON.stringify(event),
          });
        } catch {
          finish();
          return;
        }
        if (opts.isTerminal(event.type)) finish();
      };

      const unsubscribe = opts.scenarioId
        ? globalBus.subscribeScenario(opts.runId, opts.scenarioId, handler)
        : globalBus.subscribe(opts.runId, handler);

      const heartbeat = setInterval(() => {
        stream.write(": keepalive\n\n").catch(finish);
      }, 15_000);

      stream.onAbort(finish);
    });
  });
}
