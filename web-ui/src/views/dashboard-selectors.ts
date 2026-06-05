import type { RunState, RunStatus, ScenarioRun, ScenarioRunFilters, ScenarioState } from "@/types";

export function getFocusedScenario(state: RunState): ScenarioState | undefined {
  const focusedId = state.focusedScenarioId ?? state.activeScenarioId;
  return state.scenarios.find((s) => s.id === focusedId);
}

export function getCategoryRollups(
  state: RunState
): { category: string; points: number; maxPoints: number }[] {
  const categoryMap = new Map<string, { points: number; maxPoints: number }>();
  for (const s of state.scenarios) {
    if (s.status === "pending" || s.status === "running") continue;
    const existing = categoryMap.get(s.category) ?? { points: 0, maxPoints: 0 };
    categoryMap.set(s.category, {
      points: existing.points + (s.points ?? 0),
      maxPoints: existing.maxPoints + s.maxPoints,
    });
  }
  return [...categoryMap.entries()].map(([category, { points, maxPoints }]) => ({
    category,
    points,
    maxPoints,
  }));
}

export function getLivePoints(state: RunState): { total: number; max: number } {
  return state.scenarios.reduce(
    (acc, s) => ({
      total: acc.total + (s.points ?? 0),
      max: acc.max + s.maxPoints,
    }),
    { total: 0, max: 0 }
  );
}

export function getDisplayedPoints(state: RunState): { total: number; max: number } {
  if (state.status === "running") return getLivePoints(state);
  return { total: state.totalPoints, max: state.maxPoints };
}

export function getModel(state: RunState, focused: ScenarioState | undefined): string | null {
  const metrics = focused?.liveMetrics ?? state.globalMetrics;
  return state.model ?? metrics?.model ?? null;
}

export function getCallCounts(focused: ScenarioState | undefined): {
  tool: number;
  bash: number;
  edit: number;
} {
  if (!focused) return { tool: 0, bash: 0, edit: 0 };
  return {
    tool: focused.toolCallCount ?? 0,
    bash: focused.bashCallCount ?? 0,
    edit: focused.editCallCount ?? 0,
  };
}

export function isRunComplete(status: RunStatus): boolean {
  return status === "done" || status === "stopped" || status === "failed";
}

// ---------------------------------------------------------------------------
// Score slices — pure reporting aggregations over persisted scenario_runs rows.
// These NEVER touch the rubric or scoring; they only group/average columns the
// DB already persisted. The canonical filter + slice semantics live here.
// ---------------------------------------------------------------------------

/** Evaluator kinds that exercise the browser/accessibility surface. */
const BROWSER_EVALUATORS = new Set(["browser", "a11y"]);

/**
 * Score-exempt rule: a row is excluded from EVERY slice when it carries no
 * scoreable weight — `maxPoints === 0` (skipped / not-applicable rows). This
 * keeps skipped scenarios from diluting averages or pass rates. Applied
 * consistently as the first step of every slice below.
 */
export function isScoreExempt(row: ScenarioRun): boolean {
  return (row.maxPoints ?? 0) === 0;
}

export function scoreableRows(rows: ScenarioRun[]): ScenarioRun[] {
  return rows.filter((row) => !isScoreExempt(row));
}

/** Filter predicate composing the per-dimension slice filters. */
export function matchesFilters(row: ScenarioRun, filters: ScenarioRunFilters): boolean {
  if (filters.taskType && row.taskType !== filters.taskType) return false;
  if (filters.difficulty && row.difficulty !== filters.difficulty) return false;
  if (filters.surface && row.surface !== filters.surface) return false;
  if (filters.signalType && row.signalType !== filters.signalType) return false;
  if (filters.evaluatorKind && row.evaluatorKind !== filters.evaluatorKind) return false;
  if (filters.stacks?.length && !filters.stacks.every((s) => row.stacks.includes(s))) return false;
  return true;
}

export function filterRows(rows: ScenarioRun[], filters: ScenarioRunFilters): ScenarioRun[] {
  return scoreableRows(rows).filter((row) => matchesFilters(row, filters));
}

/** Score % over a set of rows: sum(points) / sum(maxPoints) * 100, exempt-excluded. */
export function scorePct(rows: ScenarioRun[]): number | null {
  const scoreable = scoreableRows(rows);
  const max = sum(scoreable.map((r) => r.maxPoints ?? 0));
  if (max === 0) return null;
  const points = sum(scoreable.map((r) => r.points ?? 0));
  return (points / max) * 100;
}

/** Behavioral-only slice — rows whose signal type is `behavioral`. */
export function behavioralRows(rows: ScenarioRun[]): ScenarioRun[] {
  return scoreableRows(rows).filter((r) => r.signalType === "behavioral");
}

export function behavioralScorePct(rows: ScenarioRun[]): number | null {
  return scorePct(behavioralRows(rows));
}

/** Browser-only slice — rows whose evaluator kind is `browser` or `a11y`. */
export function browserRows(rows: ScenarioRun[]): ScenarioRun[] {
  return scoreableRows(rows).filter(
    (r) => r.evaluatorKind !== null && BROWSER_EVALUATORS.has(r.evaluatorKind)
  );
}

export function browserScorePct(rows: ScenarioRun[]): number | null {
  return scorePct(browserRows(rows));
}

/** Hidden-test pass rate: sum(passed)/sum(total) over rows with total>0. */
export function hiddenTestPassRate(rows: ScenarioRun[]): number | null {
  const withTests = scoreableRows(rows).filter((r) => (r.hiddenTestTotal ?? 0) > 0);
  const total = sum(withTests.map((r) => r.hiddenTestTotal ?? 0));
  if (total === 0) return null;
  const passed = sum(withTests.map((r) => r.hiddenTestPassed ?? 0));
  return (passed / total) * 100;
}

/** Tool efficiency: total points earned per tool call across rows. */
export function pointsPerToolCall(rows: ScenarioRun[]): number | null {
  const scoreable = scoreableRows(rows);
  const calls = sum(scoreable.map((r) => r.toolCallCount ?? 0));
  if (calls === 0) return null;
  return sum(scoreable.map((r) => r.points ?? 0)) / calls;
}

/** Time/cost slice from wall_time_ms + model_metrics_json. */
export function timeCostSlice(rows: ScenarioRun[]): {
  totalWallSeconds: number;
  avgScenarioSeconds: number | null;
  totalTokens: number;
  completionTps: number | null;
} {
  const scoreable = scoreableRows(rows);
  const totalWallMs = sum(scoreable.map((r) => r.wallTimeMs ?? 0));
  const totalTokens = sum(scoreable.map((r) => r.modelMetrics?.totalTokens ?? 0));
  const completionTokens = sum(scoreable.map((r) => r.modelMetrics?.completionTokens ?? 0));
  const requestMs = sum(scoreable.map((r) => r.modelMetrics?.totalRequestTimeMs ?? 0));
  return {
    totalWallSeconds: totalWallMs / 1000,
    avgScenarioSeconds: scoreable.length > 0 ? totalWallMs / scoreable.length / 1000 : null,
    totalTokens,
    completionTps: requestMs > 0 ? completionTokens / (requestMs / 1000) : null,
  };
}

/** Per-dimension correctness/scope/pattern/verification/cleanup averages (exempt-excluded). */
export function dimensionAverages(rows: ScenarioRun[]): {
  correctness: number | null;
  scope: number | null;
  pattern: number | null;
  verification: number | null;
  cleanup: number | null;
} {
  const scoreable = scoreableRows(rows);
  const avg = (pick: (e: NonNullable<ScenarioRun["evaluation"]>) => number | undefined) => {
    const vals = scoreable
      .map((r) => (r.evaluation ? pick(r.evaluation) : undefined))
      .filter((v): v is number => typeof v === "number");
    return vals.length > 0 ? sum(vals) / vals.length : null;
  };
  const read = (key: string) => (e: NonNullable<ScenarioRun["evaluation"]>) =>
    (e as unknown as Record<string, number | undefined>)[key];
  return {
    correctness: avg(read("correctness")),
    scope: avg(read("scope")),
    pattern: avg(read("pattern")),
    verification: avg(read("verification")),
    cleanup: avg(read("cleanup")),
  };
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
