import { getDb } from "../server/db/migrations.ts";

export const REPORT_CATEGORIES = [
  "surgical-edit",
  "scope-discipline",
  "verify-and-repair",
  "implementation",
  "read-only-analysis",
  "responsiveness",
  "long-context",
] as const;

export type ReportSource = "local" | "api";

export type ReportCategoryScore = {
  points: number;
  maxPoints: number;
  pct: number | null;
};

export type ReportModelAggregate = {
  model: string;
  source: ReportSource;
  runs: number;
  scorePct: number;
  solveAttempts: number;
  solveCount: number;
  solveRatePct: number;
  solveCiLowPct: number;
  solveCiHighPct: number;
  disciplinePct: number;
  pointsAvg: number;
  maxAvg: number;
  totalWallSeconds: number;
  avgScenarioSeconds: number;
  avgFirstTokenSeconds: number | null;
  completionTps: number | null;
  completionTpsApprox: boolean;
  promptTps: number | null;
  promptTpsApprox: boolean;
  avgTokensPerScenario: number;
  avgTokensPerRun: number;
  promptTokensAvg: number;
  completionTokensAvg: number;
  paretoFrontier: boolean;
  toolCallsTotal: number;
  requests: number;
  timeouts: number;
  exemptScenarios: number;
  categories: Record<string, ReportCategoryScore>;
  scenarioCount: number;
  latestTimestamp: string;
};

export type ReportData = {
  models: ReportModelAggregate[];
  categories: string[];
  totals: {
    models: number;
    runs: number;
    local: number;
    api: number;
    scenarioRuns: number;
  };
  snapshot: string;
  awards: {
    bestOverall?: ReportModelAggregate;
    bestAligned?: ReportModelAggregate;
    fastestGeneration?: ReportModelAggregate;
    fastestPrompt?: ReportModelAggregate;
  };
  pareto: ParetoPoint[];
};

export type ParetoPoint = {
  model: string;
  source: ReportSource;
  scenarioId: string;
  category: string;
  points: number;
  maxPoints: number;
  scorePct: number;
  correctness: number | null;
  totalTokens: number;
};

type RunRow = {
  id: string;
  model: string | null;
  total_points: number;
  max_points: number;
  finished_at: number;
};

type ScenarioRow = {
  run_id: string;
  scenario_id: string;
  category: string | null;
  points: number | null;
  max_points: number | null;
  wall_time_ms: number | null;
  first_token_ms: number | null;
  tool_call_count: number | null;
  model_metrics_json: string | null;
  error_kind: string | null;
  rubric_kind: string;
  correctness: number | null;
  scope: number | null;
  pattern: number | null;
  verification: number | null;
  cleanup: number | null;
};

export type SolveDimRow = {
  correctness: number;
  scope: number | null;
  pattern: number | null;
  verification: number | null;
  cleanup: number | null;
};

export type SolveStats = {
  solveAttempts: number;
  solveCount: number;
  solveRatePct: number;
  solveCiLowPct: number;
  solveCiHighPct: number;
  disciplinePct: number;
};

export function wilsonInterval(
  successes: number,
  total: number,
  z = 1.96
): { low: number; high: number } {
  if (total <= 0) return { low: 0, high: 0 };
  const p = successes / total;
  const z2 = z * z;
  const center = (p + z2 / (2 * total)) / (1 + z2 / total);
  const halfwidth =
    (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / (1 + z2 / total);
  return {
    low: Math.max(0, center - halfwidth) * 100,
    high: Math.min(1, center + halfwidth) * 100,
  };
}

export function computeSolveStats(rows: SolveDimRow[]): SolveStats {
  const solveAttempts = rows.length;
  const solveCount = rows.filter((row) => row.correctness === 3).length;
  const { low, high } = wilsonInterval(solveCount, solveAttempts);

  let disciplineSum = 0;
  let disciplineCount = 0;
  for (const row of rows) {
    if (
      row.scope === null &&
      row.pattern === null &&
      row.verification === null &&
      row.cleanup === null
    ) {
      continue;
    }
    const dims =
      (row.scope ?? 0) + (row.pattern ?? 0) + (row.verification ?? 0) + (row.cleanup ?? 0);
    disciplineSum += (100 * dims) / 7;
    disciplineCount += 1;
  }

  return {
    solveAttempts,
    solveCount,
    solveRatePct: solveAttempts > 0 ? (100 * solveCount) / solveAttempts : 0,
    solveCiLowPct: low,
    solveCiHighPct: high,
    disciplinePct: disciplineCount > 0 ? disciplineSum / disciplineCount : 0,
  };
}

type MetricsShape = {
  requestCount?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  totalRequestTimeMs?: number;
  promptEvalTokens?: number;
  promptEvalTimeMs?: number;
  completionEvalTokens?: number;
  completionEvalTimeMs?: number;
};

type CategoryAggregate = { points: number; maxPoints: number };

type ModelAccumulator = {
  runIds: Set<string>;
  totalPoints: number;
  maxPoints: number;
  totalWallMs: number;
  scenarioWallMs: number;
  scenarioRuns: number;
  firstTokenSumMs: number;
  firstTokenCount: number;
  promptEvalTokens: number;
  promptEvalTimeMs: number;
  completionEvalTokens: number;
  completionEvalTimeMs: number;
  hasPromptTiming: boolean;
  hasCompletionTiming: boolean;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  metricScenarioRuns: number;
  totalRequestTimeMs: number;
  requests: number;
  toolCalls: number;
  timeouts: number;
  exemptScenarios: number;
  categories: Record<string, CategoryAggregate>;
  scenarioIds: Set<string>;
  latestFinishedAt: number;
  solveRows: SolveDimRow[];
};

export function buildReportData(): ReportData {
  const db = getDb();

  const runs = db
    .query<RunRow, []>(
      `SELECT id, model, total_points, max_points, finished_at
       FROM runs
       WHERE status = 'done'
         AND total_points IS NOT NULL
         AND max_points IS NOT NULL
         AND finished_at IS NOT NULL`
    )
    .all();

  const scenarios = db
    .query<ScenarioRow, []>(
      `SELECT sr.run_id, sr.scenario_id, sr.category, sr.points, sr.max_points, sr.wall_time_ms, sr.first_token_ms, sr.tool_call_count, sr.model_metrics_json, sr.error_kind, sr.rubric_kind, sr.correctness, sr.scope, sr.pattern, sr.verification, sr.cleanup
       FROM scenario_runs sr
       JOIN runs r ON r.id = sr.run_id
       WHERE r.status = 'done'`
    )
    .all();

  const runsById = new Map<string, RunRow>(runs.map((run) => [run.id, run]));
  const accByModel = new Map<string, ModelAccumulator>();
  const paretoPoints: ParetoPoint[] = [];

  for (const run of runs) {
    const model = run.model ?? "unknown";
    const acc = accByModel.get(model) ?? createAccumulator();
    acc.runIds.add(run.id);
    acc.totalPoints += run.total_points;
    acc.maxPoints += run.max_points;
    if (run.finished_at > acc.latestFinishedAt) acc.latestFinishedAt = run.finished_at;
    accByModel.set(model, acc);
  }

  for (const scenario of scenarios) {
    const run = runsById.get(scenario.run_id);
    if (!run) continue;

    const model = run.model ?? "unknown";
    const acc = accByModel.get(model) ?? createAccumulator();

    acc.scenarioWallMs += scenario.wall_time_ms ?? 0;
    acc.totalWallMs += scenario.wall_time_ms ?? 0;
    acc.scenarioRuns += 1;
    acc.scenarioIds.add(scenario.scenario_id);
    acc.toolCalls += scenario.tool_call_count ?? 0;

    if (scenario.error_kind === "timeout") acc.timeouts += 1;
    else if (scenario.error_kind === "infra" || scenario.error_kind === "aborted") {
      acc.exemptScenarios += 1;
    }

    if (
      scenario.rubric_kind === "10pt" &&
      scenario.correctness !== null &&
      scenario.error_kind !== "infra" &&
      scenario.error_kind !== "aborted"
    ) {
      acc.solveRows.push({
        correctness: scenario.correctness,
        scope: scenario.scope,
        pattern: scenario.pattern,
        verification: scenario.verification,
        cleanup: scenario.cleanup,
      });
    }

    if (typeof scenario.first_token_ms === "number") {
      acc.firstTokenSumMs += scenario.first_token_ms;
      acc.firstTokenCount += 1;
    }

    const categoryName = scenario.category ?? "unknown";
    const category = acc.categories[categoryName] ?? { points: 0, maxPoints: 0 };
    category.points += scenario.points ?? 0;
    category.maxPoints += scenario.max_points ?? 0;
    acc.categories[categoryName] = category;

    const metrics = parseMetrics(scenario.model_metrics_json);
    if (metrics) {
      addMetrics(acc, metrics);
      if (
        scenario.error_kind !== "infra" &&
        scenario.error_kind !== "aborted" &&
        scenario.error_kind !== "timeout"
      ) {
        acc.metricScenarioRuns += 1;
      }
    }

    if (
      metrics &&
      scenario.error_kind !== "infra" &&
      scenario.error_kind !== "aborted" &&
      scenario.error_kind !== "timeout"
    ) {
      const pt = finiteNumber(metrics.totalTokens);
      if (pt > 0) {
        paretoPoints.push({
          model,
          source: model.includes("/") ? "api" : "local",
          scenarioId: scenario.scenario_id,
          category: scenario.category ?? "unknown",
          points: scenario.points ?? 0,
          maxPoints: scenario.max_points ?? 0,
          scorePct: scenario.max_points ? ((scenario.points ?? 0) / scenario.max_points) * 100 : 0,
          correctness: scenario.rubric_kind === "10pt" ? scenario.correctness : null,
          totalTokens: pt,
        });
      }
    }

    accByModel.set(model, acc);
  }

  const models = [...accByModel.entries()]
    .map(([model, acc]) => finalizeModel(model, acc))
    .toSorted((a, b) => b.solveRatePct - a.solveRatePct || b.scorePct - a.scorePct);

  const frontierIdx = paretoFrontier(
    models
      .map((m, idx) => ({ idx, tokens: m.avgTokensPerScenario, score: m.scorePct }))
      .filter((p) => p.tokens > 0)
  );
  for (const i of frontierIdx) models[i].paretoFrontier = true;

  const scored = models.filter((model) => model.avgScenarioSeconds > 0);
  const bestAligned = scored.toSorted(
    (a, b) => b.scorePct / b.avgScenarioSeconds - a.scorePct / a.avgScenarioSeconds
  )[0];
  const fastestGeneration = models
    .filter((model) => model.completionTps !== null)
    .toSorted((a, b) => (b.completionTps ?? 0) - (a.completionTps ?? 0))[0];
  const fastestPrompt = models
    .filter((model) => model.promptTps !== null)
    .toSorted((a, b) => (b.promptTps ?? 0) - (a.promptTps ?? 0))[0];

  return {
    models,
    categories: [...REPORT_CATEGORIES],
    totals: {
      models: models.length,
      runs: runs.length,
      local: models.filter((model) => model.source === "local").length,
      api: models.filter((model) => model.source === "api").length,
      scenarioRuns: models.reduce((sum, model) => sum + model.runs * model.scenarioCount, 0),
    },
    snapshot: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
    awards: {
      bestOverall: models[0],
      bestAligned,
      fastestGeneration,
      fastestPrompt,
    },
    pareto: paretoPoints,
  };
}

function createAccumulator(): ModelAccumulator {
  return {
    runIds: new Set<string>(),
    totalPoints: 0,
    maxPoints: 0,
    totalWallMs: 0,
    scenarioWallMs: 0,
    scenarioRuns: 0,
    firstTokenSumMs: 0,
    firstTokenCount: 0,
    promptEvalTokens: 0,
    promptEvalTimeMs: 0,
    completionEvalTokens: 0,
    completionEvalTimeMs: 0,
    hasPromptTiming: false,
    hasCompletionTiming: false,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    metricScenarioRuns: 0,
    totalRequestTimeMs: 0,
    requests: 0,
    toolCalls: 0,
    timeouts: 0,
    exemptScenarios: 0,
    categories: {},
    scenarioIds: new Set<string>(),
    latestFinishedAt: 0,
    solveRows: [],
  };
}

function addMetrics(acc: ModelAccumulator, metrics: MetricsShape): void {
  const prompt = finiteNumber(metrics.promptTokens);
  const completion = finiteNumber(metrics.completionTokens);
  acc.promptTokens += prompt;
  acc.completionTokens += completion;
  // totalTokens falls back to prompt+completion when the field is absent (mirrors local-model.ts).
  acc.totalTokens += finiteNumber(metrics.totalTokens) || prompt + completion;
  acc.totalRequestTimeMs += finiteNumber(metrics.totalRequestTimeMs);
  acc.requests += finiteNumber(metrics.requestCount);

  const promptEvalTokens = finiteNumber(metrics.promptEvalTokens);
  const promptEvalTimeMs = finiteNumber(metrics.promptEvalTimeMs);
  if (promptEvalTokens > 0 && promptEvalTimeMs > 0) {
    acc.promptEvalTokens += promptEvalTokens;
    acc.promptEvalTimeMs += promptEvalTimeMs;
    acc.hasPromptTiming = true;
  }

  const completionEvalTokens = finiteNumber(metrics.completionEvalTokens);
  const completionEvalTimeMs = finiteNumber(metrics.completionEvalTimeMs);
  if (completionEvalTokens > 0 && completionEvalTimeMs > 0) {
    acc.completionEvalTokens += completionEvalTokens;
    acc.completionEvalTimeMs += completionEvalTimeMs;
    acc.hasCompletionTiming = true;
  }
}

function parseMetrics(raw: string | null): MetricsShape | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;

  return {
    requestCount: maybeNumber(parsed.requestCount),
    promptTokens: maybeNumber(parsed.promptTokens),
    completionTokens: maybeNumber(parsed.completionTokens),
    totalTokens: maybeNumber(parsed.totalTokens),
    totalRequestTimeMs: maybeNumber(parsed.totalRequestTimeMs),
    promptEvalTokens: maybeNumber(parsed.promptEvalTokens),
    promptEvalTimeMs: maybeNumber(parsed.promptEvalTimeMs),
    completionEvalTokens: maybeNumber(parsed.completionEvalTokens),
    completionEvalTimeMs: maybeNumber(parsed.completionEvalTimeMs),
  };
}

function finalizeModel(model: string, acc: ModelAccumulator): ReportModelAggregate {
  const completion = completionTps(acc);
  const prompt = promptTps(acc);
  const runCount = Math.max(1, acc.runIds.size);
  const solve = computeSolveStats(acc.solveRows);

  return {
    model,
    source: model.includes("/") ? "api" : "local",
    runs: acc.runIds.size,
    scorePct: acc.maxPoints > 0 ? (acc.totalPoints / acc.maxPoints) * 100 : 0,
    solveAttempts: solve.solveAttempts,
    solveCount: solve.solveCount,
    solveRatePct: solve.solveRatePct,
    solveCiLowPct: solve.solveCiLowPct,
    solveCiHighPct: solve.solveCiHighPct,
    disciplinePct: solve.disciplinePct,
    pointsAvg: acc.totalPoints / runCount,
    maxAvg: acc.maxPoints / runCount,
    totalWallSeconds: acc.totalWallMs / 1000 / runCount,
    avgScenarioSeconds: acc.scenarioRuns > 0 ? acc.scenarioWallMs / acc.scenarioRuns / 1000 : 0,
    avgFirstTokenSeconds:
      acc.firstTokenCount > 0 ? acc.firstTokenSumMs / acc.firstTokenCount / 1000 : null,
    completionTps: completion.value,
    completionTpsApprox: completion.approx,
    promptTps: prompt.value,
    promptTpsApprox: prompt.approx,
    ...computeTokenMeans(
      acc.totalTokens,
      acc.metricScenarioRuns,
      acc.promptTokens,
      acc.completionTokens,
      runCount
    ),
    paretoFrontier: false,
    toolCallsTotal: Math.round(acc.toolCalls / runCount),
    requests: Math.round(acc.requests / runCount),
    timeouts: acc.timeouts,
    exemptScenarios: acc.exemptScenarios,
    categories: categoryScores(acc.categories),
    scenarioCount: acc.scenarioIds.size,
    latestTimestamp: acc.latestFinishedAt > 0 ? new Date(acc.latestFinishedAt).toISOString() : "",
  };
}

export function computeTokenMeans(
  totalTokens: number,
  metricScenarioRuns: number,
  promptTokens: number,
  completionTokens: number,
  runCount: number
): {
  avgTokensPerScenario: number;
  avgTokensPerRun: number;
  promptTokensAvg: number;
  completionTokensAvg: number;
} {
  // avgTokensPerScenario divides only by scenario-runs that contributed token metrics
  // (metricScenarioRuns), not the blanket scenario-run count — exempt/timeout rows with no
  // metrics must not deflate the mean for flaky models.
  return {
    avgTokensPerScenario: metricScenarioRuns > 0 ? totalTokens / metricScenarioRuns : 0,
    avgTokensPerRun: runCount > 0 ? totalTokens / runCount : 0,
    promptTokensAvg: runCount > 0 ? promptTokens / runCount : 0,
    completionTokensAvg: runCount > 0 ? completionTokens / runCount : 0,
  };
}

function completionTps(acc: ModelAccumulator): { value: number | null; approx: boolean } {
  if (acc.hasCompletionTiming && acc.completionEvalTimeMs > 0) {
    return { value: acc.completionEvalTokens / (acc.completionEvalTimeMs / 1000), approx: false };
  }
  if (acc.completionTokens > 0 && acc.totalRequestTimeMs > 0) {
    return { value: acc.completionTokens / (acc.totalRequestTimeMs / 1000), approx: true };
  }
  return { value: null, approx: false };
}

function promptTps(acc: ModelAccumulator): { value: number | null; approx: boolean } {
  if (acc.hasPromptTiming && acc.promptEvalTimeMs > 0) {
    return { value: acc.promptEvalTokens / (acc.promptEvalTimeMs / 1000), approx: false };
  }
  if (acc.promptTokens > 0 && acc.totalRequestTimeMs > 0) {
    return { value: acc.promptTokens / (acc.totalRequestTimeMs / 1000), approx: true };
  }
  return { value: null, approx: false };
}

function categoryScores(
  aggregates: Record<string, CategoryAggregate>
): Record<string, ReportCategoryScore> {
  const scores: Record<string, ReportCategoryScore> = {};
  for (const category of REPORT_CATEGORIES) {
    const aggregate = aggregates[category];
    scores[category] =
      aggregate && aggregate.maxPoints > 0
        ? {
            points: aggregate.points,
            maxPoints: aggregate.maxPoints,
            pct: (aggregate.points / aggregate.maxPoints) * 100,
          }
        : { points: aggregate?.points ?? 0, maxPoints: 0, pct: null };
  }
  return scores;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function paretoFrontier(points: { idx: number; tokens: number; score: number }[]): number[] {
  return points
    .filter(
      (p) =>
        !points.some(
          (q) =>
            q.tokens <= p.tokens && q.score >= p.score && (q.tokens < p.tokens || q.score > p.score)
        )
    )
    .map((p) => p.idx);
}

function maybeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function finiteNumber(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
