export type PersistedEventBase = { seq: number; ts: number };

export type PersistedEvent =
  | (PersistedEventBase & {
      type: "run_started";
      runId: string;
      scenarioIds: string[];
      model: string | null;
      endpoint: string | null;
    })
  | (PersistedEventBase & {
      type: "run_finished";
      runId: string;
      totalPoints: number;
      maxPoints: number;
      reportPath: string | null;
    })
  | (PersistedEventBase & { type: "run_stopped"; runId: string; reason?: string })
  | (PersistedEventBase & { type: "run_failed"; runId: string; error: string })
  | (PersistedEventBase & {
      type: "scenario_started";
      runId: string;
      scenarioId: string;
      name?: string;
      category: string;
      maxPoints: number;
    })
  | (PersistedEventBase & {
      type: "scenario_finished";
      runId: string;
      scenarioId: string;
      status: "pass" | "partial" | "fail" | "stopped";
      points: number;
      wallTimeMs: number;
      toolCallCount: number;
      firstTokenMs?: number;
      turnWallTimes?: number[];
      turnFirstTokenMs?: number[];
      evaluation: ScenarioEvaluation;
      modelMetrics?: ModelMetrics;
    })
  | (PersistedEventBase & { type: "assistant"; runId: string; scenarioId: string; content: string })
  | (PersistedEventBase & {
      type: "assistant_delta";
      runId: string;
      scenarioId: string;
      content: string;
    })
  | (PersistedEventBase & { type: "tool_call"; runId: string; scenarioId: string; call: ToolCall })
  | (PersistedEventBase & {
      type: "tool_result";
      runId: string;
      scenarioId: string;
      call: ToolCall;
      result: string;
    })
  | (PersistedEventBase & {
      type: "model_metrics";
      runId: string;
      scenarioId: string;
      metrics: ModelMetrics;
    });

export type ToolCall = { name: string; args: string; turn: number; result?: unknown };

export type ModelMetrics = {
  model?: string;
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalRequestTimeMs: number;
  promptEvalTokens?: number;
  promptEvalTimeMs?: number;
  completionEvalTokens?: number;
  completionEvalTimeMs?: number;
};

export type EvaluationCheck = { name: string; pass: boolean; detail?: string };

export type ScenarioEvaluation = {
  status: "pass" | "partial" | "fail";
  points: number;
  maxPoints: number;
  checks: EvaluationCheck[];
  summary: string;
};

export type LogEntryKind = "assistant" | "tool" | "stdout" | "stderr" | "system";

export type LogEntry = {
  id: number;
  kind: LogEntryKind;
  label: string;
  text: string;
  time: string;
};

export type ScenarioStatus = "pending" | "running" | "pass" | "partial" | "fail" | "stopped";

export type ScenarioState = {
  id: string;
  name: string;
  category: string;
  maxPoints: number;
  status: ScenarioStatus;
  startedAt?: number;
  finishedAt?: number;
  points?: number;
  wallTimeMs?: number;
  toolCallCount?: number;
  bashCallCount?: number;
  editCallCount?: number;
  firstTokenMs?: number;
  turnWallTimes?: number[];
  turnFirstTokenMs?: number[];
  logs: LogEntry[];
  streamBuffer: string;
  liveMetrics?: ModelMetrics;
  evaluation?: ScenarioEvaluation;
};

export type RunStatus = "idle" | "running" | "done" | "stopped" | "failed";

export type RunState = {
  runId: string | null;
  status: RunStatus;
  startedAt?: number;
  scenarios: ScenarioState[];
  activeScenarioId: string | null;
  focusedScenarioId: string | null;
  totalPoints: number;
  maxPoints: number;
  globalMetrics?: ModelMetrics;
  model?: string | null;
};

export type ScenarioInfo = {
  id: string;
  name: string;
  category: string;
  maxPoints: number;
  prompt: string;
};
export type Model = {
  id: string;
  source: "local" | "remote";
  endpoint: string;
  requiresApiKey?: boolean;
};

export type RunSummary = {
  id: string;
  startedAt: number;
  finishedAt: number | null;
  status: string;
  model: string | null;
  scenarioIds: string[];
  totalPoints: number | null;
  maxPoints: number | null;
};

export type OneshotRun = {
  id: string;
  startedAt: number;
  finishedAt: number | null;
  status: string;
  model: string;
  endpoint: string;
  promptIds: string[];
  error: string | null;
};

export type OneshotResult = {
  runId: string;
  promptId: string;
  startedAt: number;
  finishedAt: number;
  status: string;
  output: string;
  finishReason: string;
  wallTimeMs: number;
  firstTokenMs: number;
  promptTokens: number;
  completionTokens: number;
  error: string | null;
};

export type OneshotPrompt = {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  body: string;
};

export type OneshotTestSummary = {
  id: string;
  title: string;
  category: string;
};

export type OneshotLatestResult = {
  promptId: string;
  startedAt: number | null;
  finishedAt: number | null;
  status: string | null;
  output: string | null;
  finishReason: string | null;
  wallTimeMs: number | null;
  firstTokenMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  error: string | null;
};

export type OneshotLatestRun = {
  runId: string;
  status: string;
  model: string | null;
  endpoint: string | null;
  promptIds: string[];
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
  results: OneshotLatestResult[];
};

export type OneshotEvent =
  | { type: "oneshot_run_started"; runId: string; promptIds: string[]; model: string; seq: number }
  | {
      type: "oneshot_test_started";
      runId: string;
      promptId: string;
      index: number;
      total: number;
      seq: number;
    }
  | { type: "oneshot_delta"; runId: string; promptId: string; content: string; seq: number }
  | {
      type: "oneshot_test_finished";
      runId: string;
      promptId: string;
      output: string;
      metrics: { promptTokens: number; completionTokens: number } | null;
      finishReason: string;
      wallTimeMs: number;
      firstTokenMs?: number;
      error?: string;
      seq: number;
    }
  | { type: "oneshot_run_finished"; runId: string; seq: number }
  | { type: "oneshot_run_failed"; runId: string; error: string; seq: number };

export type ReportSource = "local" | "api";
export type ReportSourceFilter = ReportSource | "all";

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
  pointsAvg: number;
  maxAvg: number;
  totalWallSeconds: number;
  avgScenarioSeconds: number;
  avgFirstTokenSeconds: number | null;
  completionTps: number | null;
  completionTpsApprox: boolean;
  promptTps: number | null;
  promptTpsApprox: boolean;
  toolCallsTotal: number;
  requests: number;
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
};
