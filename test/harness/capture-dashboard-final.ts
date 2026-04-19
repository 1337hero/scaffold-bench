import { BenchDashboard } from "../../lib/dashboard.ts";
import { mergeModelMetrics, sumScenarioMaxPoints } from "../../lib/scoring.ts";
import { FIXTURE_RESULTS, FIXTURE_SEEDS, FIXTURE_START_EPOCH } from "../fixtures/run-results.ts";

export function captureDashboardFinal(): string {
  const origNow = Date.now;
  const origCols = Object.getOwnPropertyDescriptor(process.stdout, "columns");
  const origRows = Object.getOwnPropertyDescriptor(process.stdout, "rows");
  const origWrite = process.stdout.write.bind(process.stdout);

  Date.now = () => FIXTURE_START_EPOCH;
  Object.defineProperty(process.stdout, "columns", { value: 120, configurable: true });
  Object.defineProperty(process.stdout, "rows", { value: 32, configurable: true });

  let captured = "";

  try {
    const ui = new BenchDashboard("local", FIXTURE_SEEDS);

    for (let i = 0; i < FIXTURE_RESULTS.length; i++) {
      const fixture = FIXTURE_RESULTS[i];
      const view = ui.scenarios[i];
      view.stage = "done";
      view.startedAt = FIXTURE_START_EPOCH + i * 100_000;
      view.finishedAt = view.startedAt + fixture.output.wallTimeMs;
      view.result = fixture;
      view.toolCalls = fixture.output.toolCalls;
      view.liveMetrics = fixture.output.modelMetrics;
      view.misses = fixture.evaluation.checks
        .filter((c) => !c.pass)
        .map((c) => `${c.name}${c.detail ? ` - ${c.detail.slice(0, 120)}` : ""}`);
      view.verificationStatus = fixture.evaluation.status === "fail" ? "fail" : "pass";
      view.verificationSummary = fixture.evaluation.summary;
    }

    const totalPoints = FIXTURE_RESULTS.reduce((s, r) => s + r.evaluation.points, 0);
    const maxPoints = sumScenarioMaxPoints(FIXTURE_RESULTS.map((r) => r.evaluation));
    const totalTime = FIXTURE_RESULTS.reduce((s, r) => s + r.output.wallTimeMs, 0);
    const totalTools = FIXTURE_RESULTS.reduce((s, r) => s + r.output.toolCalls.length, 0);
    const modelMetrics = mergeModelMetrics(FIXTURE_RESULTS.map((r) => r.output.modelMetrics));

    process.stdout.write = ((chunk: unknown) => {
      captured += typeof chunk === "string" ? chunk : String(chunk);
      return true;
    }) as typeof process.stdout.write;

    ui.renderFinal({
      resultsPath: "test/golden/fixture-output.json",
      totalPoints,
      maxPoints,
      totalTime,
      totalTools,
      modelMetrics,
    });
  } finally {
    process.stdout.write = origWrite as typeof process.stdout.write;
    Date.now = origNow;
    if (origCols) Object.defineProperty(process.stdout, "columns", origCols);
    if (origRows) Object.defineProperty(process.stdout, "rows", origRows);
  }

  return captured;
}

if (import.meta.main) {
  process.stdout.write(captureDashboardFinal());
}
