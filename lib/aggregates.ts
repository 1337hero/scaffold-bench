import {
  mergeModelMetrics,
  sumScenarioMaxPoints,
} from "./scoring.ts";
import type {
  Category,
  ModelMetrics,
  ScenarioResult,
  ScenarioStatus,
  ToolCall,
} from "./scoring.ts";

export const TOOL_NAMES = {
  bash: "bash",
  edit: "edit",
  write: "write",
  read: "read",
  grep: "grep",
  glob: "glob",
  ls: "ls",
} as const;

export interface ScenarioLike {
  id: string;
  category: Category;
  stage: "pending" | "running" | "done";
  startedAt?: number;
  finishedAt?: number;
  toolCalls: ToolCall[];
  liveMetrics?: ModelMetrics;
  result?: ScenarioResult;
}

export function computeRunTotals(scenarios: readonly ScenarioLike[]): {
  totalPoints: number;
  maxPoints: number;
  completed: number;
  total: number;
} {
  const totalPoints = scenarios.reduce(
    (sum, s) => sum + (s.result?.evaluation.points ?? 0),
    0
  );
  const maxPoints = sumScenarioMaxPoints(scenarios.map((s) => s.result?.evaluation));
  const completed = scenarios.filter((s) => s.stage === "done").length;
  return { totalPoints, maxPoints, completed, total: scenarios.length };
}

export function computeStatusBreakdown(scenarios: readonly ScenarioLike[]): {
  pass: number;
  partial: number;
  fail: number;
} {
  let pass = 0;
  let partial = 0;
  let fail = 0;
  for (const s of scenarios) {
    const status = s.result?.evaluation.status;
    if (status === "pass") pass++;
    else if (status === "partial") partial++;
    else if (status === "fail") fail++;
  }
  return { pass, partial, fail };
}

export function countStatus(
  status: ScenarioStatus,
  results: readonly ScenarioResult[]
): number {
  return results.filter((r) => r.evaluation.status === status).length;
}

export function computeCategoryRollups(
  scenarios: readonly ScenarioLike[],
  categories: readonly Category[]
): Array<{ category: Category; points: number; maxPoints: number }> {
  const out: Array<{ category: Category; points: number; maxPoints: number }> = [];
  for (const category of categories) {
    const rows = scenarios.filter((s) => s.category === category && s.result);
    if (rows.length === 0) continue;
    const points = rows.reduce((sum, s) => sum + (s.result?.evaluation.points ?? 0), 0);
    const maxPoints = sumScenarioMaxPoints(rows.map((s) => s.result?.evaluation));
    out.push({ category, points, maxPoints });
  }
  return out;
}

export function computeMisses(
  scenarios: readonly ScenarioLike[]
): Array<{ scenarioId: string; checkName: string; detail?: string }> {
  const rows: Array<{ scenarioId: string; checkName: string; detail?: string }> = [];
  for (const s of scenarios) {
    if (!s.result) continue;
    for (const check of s.result.evaluation.checks) {
      if (check.pass) continue;
      rows.push({
        scenarioId: s.id,
        checkName: check.name,
        ...(check.detail !== undefined ? { detail: check.detail } : {}),
      });
    }
  }
  return rows;
}

export function totalToolCalls(scenarios: readonly ScenarioLike[]): number {
  return scenarios.reduce(
    (sum, s) => sum + (s.result ? s.result.output.toolCalls.length : s.toolCalls.length),
    0
  );
}

export function totalWallTime(results: readonly ScenarioResult[]): number {
  return results.reduce((sum, r) => sum + r.output.wallTimeMs, 0);
}

export function findActiveIndex(scenarios: readonly ScenarioLike[]): number | undefined {
  const idx = scenarios.findIndex((s) => s.stage === "running");
  return idx === -1 ? undefined : idx;
}

export function selectActiveMetrics(
  scenarios: readonly ScenarioLike[]
): ModelMetrics | undefined {
  const active = scenarios.find((s) => s.stage === "running");
  return active?.liveMetrics;
}

export function selectFinalMetrics(
  state: { modelMetrics?: ModelMetrics }
): ModelMetrics | undefined {
  return state.modelMetrics;
}

export function selectMergedMetrics(
  scenarios: readonly ScenarioLike[]
): ModelMetrics | undefined {
  return mergeModelMetrics(
    scenarios.map((s) => s.liveMetrics ?? s.result?.output.modelMetrics)
  );
}

export function selectDisplayMetrics(
  scenarios: readonly ScenarioLike[],
  state: { modelMetrics?: ModelMetrics }
): ModelMetrics | undefined {
  return (
    selectActiveMetrics(scenarios) ??
    selectFinalMetrics(state) ??
    selectMergedMetrics(scenarios)
  );
}

export function computeScenarioMetrics(scenario: ScenarioLike): {
  toolCount: number;
  bashCalls: number;
  edits: number;
  firstTokenMs?: number;
  turnWallTimes?: number[];
} {
  const calls = scenario.toolCalls;
  const bashCalls = calls.filter((c) => c.name === TOOL_NAMES.bash).length;
  const edits = calls.filter(
    (c) => c.name === TOOL_NAMES.edit || c.name === TOOL_NAMES.write
  ).length;
  const firstTokenMs = scenario.result?.output.firstTokenMs;
  const turnWallTimes = scenario.result?.output.turnWallTimes;
  return {
    toolCount: calls.length,
    bashCalls,
    edits,
    ...(firstTokenMs !== undefined ? { firstTokenMs } : {}),
    ...(turnWallTimes !== undefined ? { turnWallTimes } : {}),
  };
}

export function computeElapsed(scenario: ScenarioLike): number {
  if (scenario.result) return scenario.result.output.wallTimeMs;
  if (scenario.startedAt === undefined) return 0;
  return (scenario.finishedAt ?? Date.now()) - scenario.startedAt;
}
