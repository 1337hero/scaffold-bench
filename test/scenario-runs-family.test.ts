import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { closeDb, runMigrations } from "../server/db/migrations.ts";
import { insertRun, upsertScenarioRun } from "../server/db/queries.ts";
import { scenarios } from "../lib/scenarios/index.js";

const ORIGINAL_DB_PATH = Bun.env.SCAFFOLD_DB_PATH;
let testDbDir: string | null = null;

describe("scenario_runs accepts every registered family", () => {
  beforeEach(() => {
    testDbDir = mkdtempSync(join(tmpdir(), "scaffold-bench-family-test-"));
    Bun.env.SCAFFOLD_DB_PATH = join(testDbDir, "scaffold-bench.test.db");
    runMigrations();
  });

  afterEach(() => {
    Bun.env.SCAFFOLD_DB_PATH = ORIGINAL_DB_PATH;
    closeDb();
    if (testDbDir) rmSync(testDbDir, { recursive: true, force: true });
    testDbDir = null;
  });

  test("upsertScenarioRun inserts a row for each family used by a registered scenario", () => {
    const families = [...new Set(scenarios.map((s) => s.family))];
    expect(families.length).toBeGreaterThan(3);

    insertRun({
      id: "fam-run",
      started_at: 1,
      status: "running",
      scenario_ids: "[]",
      runtime: "local",
      runtime_kind: "llama.cpp",
      endpoint: null,
      model: "m",
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

    for (const family of families) {
      expect(() =>
        upsertScenarioRun({
          run_id: "fam-run",
          scenario_id: `probe-${family}`,
          family,
          rubric_kind: "10pt",
          status: "pending",
        })
      ).not.toThrow();
    }
  });
});
