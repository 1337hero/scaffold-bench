import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { startOneshotRun } from "../../server/oneshot-engine.ts";
import { globalBus } from "../../server/event-bus.ts";
import {
  clearPreviousOneshot,
  getLatestOneshotRun,
  getOneshotResults,
} from "../../server/db/oneshot-queries.ts";
import { runMigrations } from "../../server/db/migrations.ts";
import { globalRegistry } from "../../server/run-registry.ts";
import { STUB_ONESHOT_ENDPOINT } from "../_fixtures/endpoints.ts";

describe("oneshot engine", () => {
  beforeEach(() => {
    runMigrations();
    clearPreviousOneshot();
    const active = globalRegistry.activeRunId();
    if (active) globalRegistry.delete(active);
  });

  afterEach(() => {
    clearPreviousOneshot();
    const active = globalRegistry.activeRunId();
    if (active) globalRegistry.delete(active);
  });

  test("startOneshotRun returns a runId", async () => {
    const { runId } = await startOneshotRun({
      promptIds: ["01-meadow-canvas"],
      modelId: "test-model",
      endpoint: STUB_ONESHOT_ENDPOINT,
    });

    expect(typeof runId).toBe("string");
    expect(runId.length).toBeGreaterThan(0);
  });

  test("engine emits events in expected sequence", async () => {
    const events: string[] = [];
    let unsubscribe: (() => void) | null = null;

    const { runId } = await startOneshotRun({
      promptIds: ["01-meadow-canvas", "02-snake-game"],
      modelId: "seq-model",
      endpoint: STUB_ONESHOT_ENDPOINT,
      onRunId: (id) => {
        unsubscribe = globalBus.subscribe(id, (event) => {
          if (event.type.startsWith("oneshot_")) {
            events.push(event.type);
          }
        });
      },
    });

    await waitForRunToFinish(runId);
    unsubscribe?.();

    expect(events).toContain("oneshot_run_started");
    expect(events).toContain("oneshot_test_started");
    expect(events).toContain("oneshot_test_finished");
  });

  test("results are persisted after run completes", async () => {
    const { runId } = await startOneshotRun({
      promptIds: ["01-meadow-canvas"],
      modelId: "persist-model",
      endpoint: STUB_ONESHOT_ENDPOINT,
    });

    await waitForRunToFinish(runId);

    const latest = getLatestOneshotRun();
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe(runId);
    expect(["done", "failed", "stopped"]).toContain(latest!.status);

    const results = getOneshotResults(runId);
    expect(results).toHaveLength(1);
  });

  test("per-prompt errors do not crash engine process", async () => {
    const { runId } = await startOneshotRun({
      promptIds: ["01-meadow-canvas", "02-snake-game", "03-svg-portrait"],
      modelId: "error-model",
      endpoint: STUB_ONESHOT_ENDPOINT,
    });

    await waitForRunToFinish(runId);

    const latest = getLatestOneshotRun();
    expect(latest).not.toBeNull();

    const results = getOneshotResults(runId);
    expect(results.length).toBeGreaterThan(0);
  });

  test("aborted run emits oneshot_run_stopped", async () => {
    const events: string[] = [];

    const { runId } = await startOneshotRun({
      promptIds: ["01-meadow-canvas", "02-snake-game", "03-svg-portrait"],
      modelId: "stop-model",
      endpoint: STUB_ONESHOT_ENDPOINT,
      onRunId: (id) => {
        globalBus.subscribe(id, (event) => {
          if (event.type.startsWith("oneshot_")) events.push(event.type);
        });
      },
    });

    globalRegistry.get(runId)?.abort();
    await waitForRunToFinish(runId);

    const latest = getLatestOneshotRun();
    expect(latest?.status).toBe("stopped");
    expect(events).toContain("oneshot_run_stopped");
  });
});

async function waitForRunToFinish(runId: string): Promise<void> {
  for (let i = 0; i < 80; i++) {
    const run = getLatestOneshotRun();
    if (run && run.id === runId && run.status !== "running") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`oneshot run did not finish: ${runId}`);
}
