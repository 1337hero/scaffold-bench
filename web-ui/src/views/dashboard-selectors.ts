import type { RunState, RunStatus, ScenarioState } from "@/types";

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
