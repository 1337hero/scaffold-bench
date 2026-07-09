import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { closeDb, runMigrations } from "../server/db/migrations.ts";
import { insertRun, updateRun, upsertScenarioRun } from "../server/db/queries.ts";
import { scenarios, type Scenario } from "../lib/scenarios/index.js";
import { buildReportData, REPORT_DIFFICULTIES } from "../lib/report-data.ts";
import type { Difficulty } from "../lib/scenarios/_shared/types.ts";

const isDifficulty = (v: unknown): v is Difficulty => v === "low" || v === "medium" || v === "high";

const SCENARIO_DIR = join(import.meta.dir, "../lib/scenarios");

describe("difficulty tiers — registry completeness", () => {
  test("every registered scenario declares a valid difficulty", () => {
    expect(scenarios.length).toBe(50);
    for (const scenario of scenarios) {
      expect(REPORT_DIFFICULTIES).toContain(scenario.difficulty);
    }
  });

  test("every scenario file keeps meta.difficulty in sync with the scenario object", async () => {
    const files = readdirSync(SCENARIO_DIR).filter(
      (name) => name.startsWith("SB-") && name.endsWith(".ts")
    );
    expect(files.length).toBe(50);

    for (const file of files) {
      const mod = await import(join("../lib/scenarios", file));
      const meta = mod.meta as { difficulty?: unknown };
      const scenario = mod.default as Scenario;
      expect(isDifficulty(meta.difficulty), `${file}: meta.difficulty invalid`).toBe(true);
      expect(isDifficulty(scenario.difficulty), `${file}: scenario.difficulty invalid`).toBe(true);
      expect(meta.difficulty, `${file}: meta vs scenario drift`).toBe(scenario.difficulty);
    }
  });

  test("tier distribution is sane (all three tiers populated)", () => {
    const counts: Record<Difficulty, number> = { low: 0, medium: 0, high: 0 };
    for (const s of scenarios) counts[s.difficulty] += 1;
    for (const tier of REPORT_DIFFICULTIES) {
      expect(counts[tier], `no scenarios tagged ${tier}`).toBeGreaterThan(0);
    }
    expect(scenarios.length).toBe(50);
  });
});

describe("difficulty tiers — report aggregation", () => {
  const ORIGINAL_DB_PATH = Bun.env.SCAFFOLD_DB_PATH;
  let dir: string | null = null;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scaffold-bench-difficulty-"));
    Bun.env.SCAFFOLD_DB_PATH = join(dir, "test.db");
    runMigrations();
  });

  afterEach(() => {
    Bun.env.SCAFFOLD_DB_PATH = ORIGINAL_DB_PATH;
    closeDb();
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  test("tiers accumulate per-difficulty and skip unknown scenario ids", () => {
    insertRun({
      id: "r1",
      started_at: 1,
      status: "done",
      scenario_ids: "[]",
      runtime: "local",
      runtime_kind: "llama.cpp",
      endpoint: null,
      model: "M",
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
    updateRun("r1", { status: "done", finished_at: 2, total_points: 23, max_points: 30 });

    // SB-01 is tagged low (10/10), SB-30 tagged high (5/10). "SB-RETIRED" is not in
    // the registry → must be skipped from tiers (but still flows through categories).
    const rows: Array<{
      scenario_id: string;
      category: string;
      points: number;
      max_points: number;
      status: "pass" | "partial" | "fail";
    }> = [
      {
        scenario_id: "SB-01",
        category: "surgical-edit",
        points: 10,
        max_points: 10,
        status: "pass",
      },
      {
        scenario_id: "SB-30",
        category: "implementation",
        points: 5,
        max_points: 10,
        status: "partial",
      },
      {
        scenario_id: "SB-RETIRED",
        category: "surgical-edit",
        points: 8,
        max_points: 10,
        status: "pass",
      },
    ];
    for (const r of rows) {
      upsertScenarioRun({
        run_id: "r1",
        scenario_id: r.scenario_id,
        category: r.category,
        family: "regex-style",
        rubric_kind: "10pt",
        status: r.status,
        points: r.points,
        max_points: r.max_points,
        wall_time_ms: 100,
      });
    }

    const report = buildReportData();
    expect(report.models.length).toBe(1);
    const model = report.models[0];

    // low: only SB-01 (SB-RETIRED excluded — not in registry)
    expect(model.tiers.low).toEqual({ points: 10, maxPoints: 10, pct: 100 });
    // high: only SB-30
    expect(model.tiers.high).toEqual({ points: 5, maxPoints: 10, pct: 50 });
    // medium: nothing scored → omitted entirely (Partial record)
    expect(model.tiers.medium).toBeUndefined();
    // The retired scenario still counts in category aggregation (surgical-edit),
    // proving it was only skipped from tier aggregation, not silently dropped.
    expect(model.categories["surgical-edit"]).toEqual({
      points: 18,
      maxPoints: 20,
      pct: 90,
    });
  });
});
