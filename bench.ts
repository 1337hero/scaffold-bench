#!/usr/bin/env bun
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { BenchDashboard } from "./lib/dashboard.ts";
import { runScenario } from "./lib/orchestrator.ts";
import { localRuntime } from "./lib/runtimes/local-agent.ts";
import type { Runtime } from "./lib/runtimes/types.ts";
import { scenarios } from "./lib/scenarios.ts";
import {
  completionTokensPerSecond,
  mergeModelMetrics,
  promptTokensPerSecond,
} from "./lib/scoring.ts";
import type { Category, ScenarioResult } from "./lib/scoring.ts";
import {
  computeCategoryRollups,
  computeRunTotals,
  countStatus,
  totalToolCalls,
  totalWallTime,
  type ScenarioLike,
} from "./lib/aggregates.ts";

const RUNTIMES: Record<string, Runtime> = {
  local: localRuntime,
};

const categories: Category[] = [
  "surgical-edit",
  "audit",
  "scope-discipline",
  "read-only-analysis",
  "verify-and-repair",
  "implementation",
  "responsiveness",
  "long-context",
];

function resultToLike(r: ScenarioResult): ScenarioLike {
  return {
    id: r.scenarioId,
    category: r.category,
    stage: "done",
    toolCalls: r.output.toolCalls,
    result: r,
  };
}

export function printPlainSummary(
  results: ScenarioResult[],
  totalPoints: number,
  maxPoints: number,
  totalTime: number,
  totalTools: number,
  outPath: string
): void {
  const modelMetrics = mergeModelMetrics(results.map((result) => result.output.modelMetrics));
  const promptTps = modelMetrics ? promptTokensPerSecond(modelMetrics) : undefined;
  const completionTps = modelMetrics ? completionTokensPerSecond(modelMetrics) : undefined;

  console.log();
  console.log("━".repeat(72));
  console.log("  SUMMARY");
  console.log("━".repeat(72));
  console.log(
    `  Score:   ${totalPoints}/${maxPoints} points  (${results.length} scenarios)`
  );
  console.log(
    `  Status:  ${countStatus("pass", results)}✓  ${countStatus("partial", results)}◐  ${countStatus("fail", results)}✗`
  );
  console.log(`  Tools:   ${totalTools} calls`);
  console.log(`  Time:    ${Math.round(totalTime / 1000)}s total`);
  if (modelMetrics) {
    if (modelMetrics.model) {
      console.log(`  Model:   ${modelMetrics.model}`);
    }
    console.log(`  Prompt:  ${modelMetrics.promptTokens} tok${promptTps !== undefined ? `  @ ${promptTps.toFixed(1)} t/s` : ""}`);
    console.log(`  Gen:     ${modelMetrics.completionTokens} tok${completionTps !== undefined ? `  @ ${completionTps.toFixed(1)} t/s` : ""}`);
    console.log(`  Calls:   ${modelMetrics.requestCount} chat requests`);
  }
  console.log();
  console.log("  By category:");
  const likes = results.map(resultToLike);
  for (const { category, points, maxPoints } of computeCategoryRollups(likes, categories)) {
    console.log(`    ${category.padEnd(22)} ${points}/${maxPoints}`);
  }
  console.log();
  console.log(`  Results: ${outPath}`);
  console.log("━".repeat(72));
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      runtime: { type: "string", short: "r", default: "local" },
      scenario: { type: "string", short: "s" },
      timeout: { type: "string", short: "t", default: "600000" },
    },
    strict: true,
  });

  const runtimeName = String(values.runtime);
  const runtime = RUNTIMES[runtimeName];
  if (!runtime) {
    console.error(`Unknown runtime: ${runtimeName}. Choices: ${Object.keys(RUNTIMES).join(", ")}`);
    process.exit(1);
  }

  const timeoutMs = Number(values.timeout);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    console.error(`Invalid --timeout: ${values.timeout}. Must be a positive number (ms).`);
    process.exit(1);
  }
  const filter = values.scenario ? String(values.scenario) : undefined;
  const activeScenarios = filter
    ? scenarios.filter((s) => s.name === filter || s.id === filter)
    : scenarios;

  if (activeScenarios.length === 0) {
    console.error(
      `No scenarios matched "${filter}". Available: ${scenarios.map((s) => s.name).join(", ")}`
    );
    process.exit(1);
  }

  const results: ScenarioResult[] = [];
  const ui = process.stdout.isTTY
    ? new BenchDashboard(
        runtime.name,
        activeScenarios.map((scenario) => ({
          id: scenario.id,
          name: scenario.name,
          prompt: scenario.prompt,
          category: scenario.category,
        }))
      )
    : null;

  let finished = false;

  try {
    ui?.attach();
    if (ui) {
      ui.tick(0);
    } else {
      console.log("━".repeat(72));
      console.log(`  scaffold-bench — runtime=${runtime.name}`);
      console.log("━".repeat(72));
    }

    for (const [index, scenario] of activeScenarios.entries()) {
      if (!ui) {
        process.stdout.write(`  ${scenario.id.padEnd(6)} ${scenario.name.padEnd(22)} `);
      } else {
        ui.beginScenario(index);
      }

      const result = await runScenario({
        runtime,
        scenario,
        timeoutMs,
        onRuntimeEvent: (event) => {
          ui?.recordEvent(index, event);
        },
      });

      results.push(result);

      ui?.completeScenario(index, result);

      if (!ui) {
        const statusTag = {
          pass: "✓ PASS",
          partial: "◐ PART",
          fail: "✗ FAIL",
        }[result.evaluation.status];

        const toolCount = result.output.toolCalls.length;
        const timeS = Math.round(result.output.wallTimeMs / 1000);
        console.log(`${statusTag} (${result.evaluation.points}pt)  ${toolCount} tools  ${timeS}s`);

        for (const check of result.evaluation.checks.filter((c) => !c.pass)) {
          console.log(
            `    · miss: ${check.name}${check.detail ? ` — ${check.detail.slice(0, 60)}` : ""}`
          );
        }
      }
    }

    const resultLikes = results.map(resultToLike);
    const { totalPoints, maxPoints } = computeRunTotals(resultLikes);
    const totalTime = totalWallTime(results);
    const totalTools = totalToolCalls(resultLikes);
    const modelMetrics = mergeModelMetrics(results.map((result) => result.output.modelMetrics));

    const timestamp = Date.now();
    const resultsDir = join(import.meta.dir, "results");
    await mkdir(resultsDir, { recursive: true });
    const outPath = join(resultsDir, `${timestamp}-${runtime.name}.json`);
    await Bun.write(
      outPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          runtime: runtime.name,
          totalPoints,
          maxPoints,
          modelMetrics,
          results: results.map((r) => ({
            scenarioId: r.scenarioId,
            category: r.category,
            status: r.evaluation.status,
            points: r.evaluation.points,
            maxPoints: r.evaluation.maxPoints,
            toolCallCount: r.output.toolCalls.length,
            wallTimeMs: r.output.wallTimeMs,
            firstTokenMs: r.output.firstTokenMs,
            turnWallTimes: r.output.turnWallTimes,
            turnFirstTokenMs: r.output.turnFirstTokenMs,
            error: r.output.error,
            modelMetrics: r.output.modelMetrics,
            scenarioMetrics: r.output.scenarioMetrics,
            checks: r.evaluation.checks,
            ...(r.evaluation.status !== "pass" && {
              transcript: r.output.stdout,
              toolCalls: r.output.toolCalls,
            }),
          })),
        },
        null,
        2
      )
    );

    if (ui) {
      ui.renderFinal({
        resultsPath: outPath,
        totalPoints,
        maxPoints,
        totalTime,
        totalTools,
        modelMetrics,
      });
      ui.finish();
      finished = true;
    } else {
      printPlainSummary(results, totalPoints, maxPoints, totalTime, totalTools, outPath);
    }
  } finally {
    if (ui && !finished) ui.dispose();
  }
}
