#!/usr/bin/env bun
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { BenchDashboard } from "./lib/dashboard.ts";
import { runScenario } from "./lib/orchestrator.ts";
import { localRuntime } from "./lib/runtimes/local-agent.ts";
import type { Runtime } from "./lib/runtimes/types.ts";
import { scenarios } from "./lib/scenarios.ts";
import type { Category, ScenarioResult, ScenarioStatus } from "./lib/scoring.ts";

const RUNTIMES: Record<string, Runtime> = {
  local: localRuntime,
};

const { values } = parseArgs({
  options: {
    runtime: { type: "string", short: "r", default: "local" },
    mode: { type: "string", short: "m", default: "lite" },
    scenario: { type: "string", short: "s" },
    timeout: { type: "string", short: "t", default: "180000" },
  },
  strict: true,
});

const runtimeName = String(values.runtime);
const runtime = RUNTIMES[runtimeName];
if (!runtime) {
  console.error(`Unknown runtime: ${runtimeName}. Choices: ${Object.keys(RUNTIMES).join(", ")}`);
  process.exit(1);
}

const mode = String(values.mode);
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

const categories: Category[] = [
  "surgical-edit",
  "audit",
  "scope-discipline",
  "read-only-analysis",
  "verify-and-repair",
];

function countStatus(s: ScenarioStatus, rs: ScenarioResult[]): number {
  return rs.filter((r) => r.evaluation.status === s).length;
}

function printPlainSummary(
  results: ScenarioResult[],
  totalPoints: number,
  maxPoints: number,
  totalTime: number,
  totalTools: number,
  outPath: string
): void {
  console.log();
  console.log("━".repeat(72));
  console.log("  SUMMARY");
  console.log("━".repeat(72));
  console.log(
    `  Score:   ${totalPoints}/${maxPoints} points  (${results.length} scenarios, 2pt max each)`
  );
  console.log(
    `  Status:  ${countStatus("pass", results)}✓  ${countStatus("partial", results)}◐  ${countStatus("fail", results)}✗`
  );
  console.log(`  Tools:   ${totalTools} calls`);
  console.log(`  Time:    ${Math.round(totalTime / 1000)}s total`);
  console.log();
  console.log("  By category:");
  for (const cat of categories) {
    const rows = results.filter((r) => r.category === cat);
    if (rows.length === 0) continue;
    const pts = rows.reduce((sum, r) => sum + r.evaluation.points, 0);
    const max = rows.length * 2;
    console.log(`    ${cat.padEnd(22)} ${pts}/${max}`);
  }
  console.log();
  console.log(`  Results: ${outPath}`);
  console.log("━".repeat(72));
}

async function main(): Promise<void> {
  const results: ScenarioResult[] = [];
  const ui = process.stdout.isTTY
    ? new BenchDashboard(
        runtime.name,
        mode,
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
      console.log(`  scaffold-bench — runtime=${runtime.name} mode=${mode}`);
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
        mode,
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

    const totalPoints = results.reduce((sum, r) => sum + r.evaluation.points, 0);
    const maxPoints = results.length * 2;
    const totalTime = results.reduce((sum, r) => sum + r.output.wallTimeMs, 0);
    const totalTools = results.reduce((sum, r) => sum + r.output.toolCalls.length, 0);

    const timestamp = Date.now();
    const resultsDir = join(import.meta.dir, "results");
    await mkdir(resultsDir, { recursive: true });
    const outPath = join(resultsDir, `${timestamp}-${runtime.name}-${mode}.json`);
    await Bun.write(
      outPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          runtime: runtime.name,
          mode,
          totalPoints,
          maxPoints,
          results: results.map((r) => ({
            scenarioId: r.scenarioId,
            category: r.category,
            status: r.evaluation.status,
            points: r.evaluation.points,
            toolCallCount: r.output.toolCalls.length,
            wallTimeMs: r.output.wallTimeMs,
            error: r.output.error,
            checks: r.evaluation.checks,
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

await main();
