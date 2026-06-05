// Standalone, opt-in entrypoint for the qualitative LLM reviewer.
//
// This is the ONLY place reviewRun is wired up. It is NOT on the scoring path:
// run-engine and the scoring modules never import it. Run explicitly, e.g.:
//   SCAFFOLD_LLM_REVIEW=1 \
//   SCAFFOLD_LLM_REVIEW_ENDPOINT=http://127.0.0.1:8082 \
//   SCAFFOLD_LLM_REVIEW_MODEL=some-model \
//   bun scripts/llm-review.ts <run-id> results/<file>.json
//
// With SCAFFOLD_LLM_REVIEW unset (default) this no-ops and writes nothing.

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { runMigrations } from "../server/db/migrations.ts";
import { reviewRun, isReviewEnabled } from "../lib/review/llm-judge.ts";

interface RunFileShape {
  modelMetrics?: { model?: string };
  results: {
    scenarioId: string;
    category?: string;
    status?: string;
    points?: number;
    maxPoints?: number;
    checks?: { name: string; pass: boolean; detail?: string }[];
  }[];
}

function latestResultFile(): string {
  const dir = resolve("results");
  const files = readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .map((n) => join(dir, n))
    .toSorted();
  if (files.length === 0) throw new Error(`No result JSON files found in ${dir}`);
  return files[files.length - 1]!;
}

async function main(): Promise<void> {
  const runId = process.argv[2] ?? `review-${Date.now()}`;
  const filePath = process.argv[3] ? resolve(process.argv[3]) : latestResultFile();

  if (!isReviewEnabled()) {
    console.log("SCAFFOLD_LLM_REVIEW is not set to 1; reviewer disabled (no-op). Wrote 0 notes.");
    return;
  }

  runMigrations();
  const file = JSON.parse(readFileSync(filePath, "utf8")) as RunFileShape;

  await reviewRun({
    runId,
    model: file.modelMetrics?.model ?? null,
    scenarios: file.results.map((r) => ({
      scenarioId: r.scenarioId,
      category: r.category,
      status: r.status,
      points: r.points,
      maxPoints: r.maxPoints,
      checks: r.checks,
    })),
  });

  console.log(`Review complete for run ${runId} from ${filePath}.`);
}

void main();
