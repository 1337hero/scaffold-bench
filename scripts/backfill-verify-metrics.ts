#!/usr/bin/env bun
/**
 * Backfill behavioral self-testing metrics (bash_calls, post_change_bash_calls,
 * verify_passes, mutated) on scenario_runs from archived artifacts.
 *
 * Zero model calls. Idempotent — only rows with NULL mutated are updated.
 *
 * Usage:
 *   bun scripts/backfill-verify-metrics.ts
 *   bun scripts/backfill-verify-metrics.ts --dry-run
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getDb, runMigrations, closeDb } from "../server/db/migrations.ts";
import { deriveVerifyMetrics } from "../lib/scoring.ts";
import type { ToolCall } from "../lib/scoring.ts";
import type { WorkspaceArchive } from "../lib/artifacts.ts";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

type ArtifactFile = {
  toolCalls?: ToolCall[];
  archive?: WorkspaceArchive;
};

type CandidateRow = {
  run_id: string;
  scenario_id: string;
  artifact_path: string;
};

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  runMigrations();
  const db = getDb();

  const rows = db
    .query<
      CandidateRow,
      []
    >(
      `SELECT run_id, scenario_id, artifact_path
       FROM scenario_runs
       WHERE artifact_path IS NOT NULL
         AND mutated IS NULL`
    )
    .all();

  let updated = 0;
  let skipped = 0;

  const update = db.query(
    `UPDATE scenario_runs
     SET bash_calls = ?, post_change_bash_calls = ?, verify_passes = ?, mutated = ?
     WHERE run_id = ? AND scenario_id = ?`
  );

  for (const row of rows) {
    const artifactFull = join(import.meta.dir, "..", row.artifact_path);
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

    const metrics = deriveVerifyMetrics(artifact.toolCalls ?? [], artifact.archive ?? null);

    if (!dryRun) {
      update.run(
        metrics.bash_calls,
        metrics.post_change_bash_calls,
        metrics.verify_passes,
        metrics.mutated,
        row.run_id,
        row.scenario_id
      );
    }
    updated++;
  }

  console.log(
    `${GREEN}updated ${updated}${RESET} / ${DIM}skipped ${skipped}${RESET} / candidates ${rows.length}${dryRun ? ` ${DIM}(dry run — no writes)${RESET}` : ""}`
  );

  closeDb();
}

if (import.meta.main) {
  main();
}
