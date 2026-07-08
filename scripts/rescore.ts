#!/usr/bin/env bun
/**
 * Re-run scenario.evaluate() against archived workspaces instead of the model —
 * for rubric changes that don't need a fresh model invocation.
 *
 * Usage:
 *   bun scripts/rescore.ts --all --dry-run
 *   bun scripts/rescore.ts --run <runId>
 *   bun scripts/rescore.ts --model <name> [--scenario SB-14] [--dry-run]
 */
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { getDb, runMigrations, closeDb } from "../server/db/migrations.ts";
import { updateRun, withTransaction } from "../server/db/queries.ts";
import { reconstructWorkspace } from "../lib/artifacts.ts";
import type { WorkspaceArchive } from "../lib/artifacts.ts";
import { scenarios as allScenarios } from "../lib/scenarios/index.js";
import { applyHallucinationPenalty } from "../lib/scoring.ts";
import type { ModelMetrics, ScenarioEvaluation, ToolCall } from "../lib/scoring.ts";

const GOLD = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

type ArtifactFile = {
  version: 1;
  runId: string;
  scenarioId: string;
  archive: WorkspaceArchive;
  toolCalls: ToolCall[];
  stdout: string;
  wallTimeMs: number;
  firstTokenMs?: number;
  turnWallTimes?: number[];
  turnFirstTokenMs?: Array<number | undefined>;
  modelMetrics?: ModelMetrics;
  scenarioMetrics?: Record<string, unknown>;
};

export type RescoreResult = { evaluation: ScenarioEvaluation; workDir: string };

/** Reconstructs the archived workspace and re-runs scenario.evaluate() on it. Caller cleans up workDir. */
export async function rescoreArtifact(
  scenarioId: string,
  artifact: ArtifactFile
): Promise<RescoreResult> {
  const scenario = allScenarios.find((s) => s.id === scenarioId);
  if (!scenario?.evaluate) {
    throw new Error(`no evaluate() available for scenario ${scenarioId}`);
  }

  const workDir = await reconstructWorkspace(artifact.archive);
  const evaluation = applyHallucinationPenalty(
    await scenario.evaluate({
      stdout: artifact.stdout,
      playgroundDir: workDir,
      toolCalls: artifact.toolCalls,
      wallTimeMs: artifact.wallTimeMs,
      firstTokenMs: artifact.firstTokenMs,
      turnWallTimes: artifact.turnWallTimes,
      turnFirstTokenMs: artifact.turnFirstTokenMs,
      modelMetrics: artifact.modelMetrics,
      scenarioMetrics: artifact.scenarioMetrics,
    }),
    artifact.toolCalls
  );

  return { evaluation, workDir };
}

type Args = { run?: string; model?: string; scenario?: string; all: boolean; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { all: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--run") args.run = argv[++i];
    else if (flag === "--model") args.model = argv[++i];
    else if (flag === "--scenario") args.scenario = argv[++i];
    else if (flag === "--all") args.all = true;
    else if (flag === "--dry-run") args.dryRun = true;
  }
  return args;
}

type CandidateRow = {
  run_id: string;
  scenario_id: string;
  artifact_path: string | null;
  points: number | null;
  max_points: number | null;
  status: string | null;
};

function findCandidates(args: Args): CandidateRow[] {
  const db = getDb();
  const where: string[] = [];
  const params: string[] = [];
  if (args.run) {
    where.push("sr.run_id = ?");
    params.push(args.run);
  }
  if (args.model) {
    where.push("r.model = ?");
    params.push(args.model);
  }
  if (args.scenario) {
    where.push("sr.scenario_id = ?");
    params.push(args.scenario);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  return db
    .query<
      CandidateRow,
      string[]
    >(`SELECT sr.run_id, sr.scenario_id, sr.artifact_path, sr.points, sr.max_points, sr.status FROM scenario_runs sr JOIN runs r ON r.id = sr.run_id ${whereClause}`)
    .all(...params);
}

function statusColor(changed: boolean): string {
  return changed ? GOLD : DIM;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.all && !args.run && !args.model && !args.scenario) {
    console.error(
      "Usage: bun scripts/rescore.ts (--all | --run <id> | --model <name> | --scenario <SB-xx>) [--dry-run]"
    );
    process.exit(1);
  }

  runMigrations();
  const db = getDb();
  const rows = findCandidates(args);
  const withArtifact = rows.filter((r) => r.artifact_path);
  let skipped = rows.length - withArtifact.length;

  let rescored = 0;
  let changed = 0;
  const updatesByRun = new Map<string, void>();

  for (const row of withArtifact) {
    const artifactFull = join(import.meta.dir, "..", row.artifact_path!);
    let artifact: ArtifactFile;
    try {
      artifact = JSON.parse(await readFile(artifactFull, "utf-8"));
    } catch (err) {
      console.error(
        `${RED}skip${RESET} ${row.run_id}/${row.scenario_id}: cannot read artifact (${err})`
      );
      skipped++;
      continue;
    }

    let result: RescoreResult;
    try {
      result = await rescoreArtifact(row.scenario_id, artifact);
    } catch (err) {
      console.error(`${RED}skip${RESET} ${row.run_id}/${row.scenario_id}: ${err}`);
      skipped++;
      continue;
    }

    try {
      const { evaluation } = result;
      const isChanged = evaluation.points !== row.points || evaluation.status !== row.status;
      rescored++;
      if (isChanged) changed++;

      const color = statusColor(isChanged);
      console.log(
        `${color}${row.run_id.slice(0, 8)}/${row.scenario_id}${RESET} ${row.points}/${row.max_points} (${row.status}) -> ${evaluation.points}/${evaluation.maxPoints} (${evaluation.status})`
      );

      if (!args.dryRun && isChanged) {
        const breakdown = evaluation.rubricBreakdown ?? null;
        db.run(
          `UPDATE scenario_runs SET points = ?, status = ?, correctness = ?, scope = ?, pattern = ?, verification = ?, cleanup = ?, evaluation_json = ? WHERE run_id = ? AND scenario_id = ?`,
          [
            evaluation.points,
            evaluation.status,
            breakdown?.correctness ?? null,
            breakdown?.scope ?? null,
            breakdown?.pattern ?? null,
            breakdown?.verification ?? null,
            breakdown?.cleanup ?? null,
            JSON.stringify(evaluation),
            row.run_id,
            row.scenario_id,
          ]
        );
        updatesByRun.set(row.run_id, undefined);
      }
    } finally {
      await rm(result.workDir, { recursive: true, force: true });
    }
  }

  if (!args.dryRun && updatesByRun.size > 0) {
    withTransaction(() => {
      for (const runId of updatesByRun.keys()) {
        const totals = db
          .query<
            { total: number | null; max: number | null },
            [string]
          >("SELECT SUM(points) as total, SUM(max_points) as max FROM scenario_runs WHERE run_id = ?")
          .get(runId);
        updateRun(runId, {
          total_points: totals?.total ?? 0,
          max_points: totals?.max ?? 0,
        });
      }
    });
  }

  console.log("");
  console.log(
    `${GREEN}examined ${rows.length}${RESET} / ${GOLD}rescored ${rescored}${RESET} / ${GOLD}changed ${changed}${RESET} / ${DIM}skipped ${skipped}${RESET}${args.dryRun ? ` ${DIM}(dry run — no writes)${RESET}` : ""}`
  );

  closeDb();
}

if (import.meta.main) {
  main();
}
