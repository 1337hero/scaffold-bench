import { printPlainSummary } from "../../bench.ts";
import { sumScenarioMaxPoints } from "../../lib/scoring.ts";
import { FIXTURE_RESULTS } from "../fixtures/run-results.ts";

export function capturePlainSummary(): string {
  const results = FIXTURE_RESULTS;
  const totalPoints = results.reduce((s, r) => s + r.evaluation.points, 0);
  const maxPoints = sumScenarioMaxPoints(results.map((r) => r.evaluation));
  const totalTime = results.reduce((s, r) => s + r.output.wallTimeMs, 0);
  const totalTools = results.reduce((s, r) => s + r.output.toolCalls.length, 0);
  const outPath = "test/golden/fixture-output.json";

  const chunks: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    chunks.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
  };
  try {
    printPlainSummary(results, totalPoints, maxPoints, totalTime, totalTools, outPath);
  } finally {
    console.log = origLog;
  }
  return `${chunks.join("\n")}\n`;
}

if (import.meta.main) {
  process.stdout.write(capturePlainSummary());
}
