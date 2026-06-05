import type {
  ScenarioInfo,
  Model,
  RunSummary,
  ReportData,
  ScenarioRun,
  ScenarioRunFilters,
  ReviewNote,
  OneshotLatestRun,
  OneshotTestSummary,
} from "@/types";

const BASE = "/api";

export class ApiError extends Error {
  status: number;
  activeRunId?: string;

  constructor(message: string, status: number, activeRunId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.activeRunId = activeRunId;
  }
}

function reportQuery(filters?: ScenarioRunFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  if (filters.stacks?.length) params.set("stacks", filters.stacks.join(","));
  if (filters.taskType) params.set("taskType", filters.taskType);
  if (filters.difficulty) params.set("difficulty", filters.difficulty);
  if (filters.surface) params.set("surface", filters.surface);
  if (filters.signalType) params.set("signalType", filters.signalType);
  if (filters.evaluatorKind) params.set("evaluatorKind", filters.evaluatorKind);
  const query = params.toString();
  return query ? `?${query}` : "";
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; activeRunId?: string };
    throw new ApiError(err.error ?? `POST ${path} → ${res.status}`, res.status, err.activeRunId);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getScenarios: (signal?: AbortSignal) => get<ScenarioInfo[]>("/scenarios", signal),
  getModels: (signal?: AbortSignal) => get<{ local: Model[]; remote: Model[] }>("/models", signal),
  listRuns: (signal?: AbortSignal) => get<RunSummary[]>("/runs", signal),
  getReportData: (filters?: ScenarioRunFilters, signal?: AbortSignal) =>
    get<ReportData>(`/bench-report/data${reportQuery(filters)}`, signal),
  activeRun: (signal?: AbortSignal) => get<{ runId: string | null }>("/runs/active", signal),
  getRun: (id: string, signal?: AbortSignal) =>
    get<RunSummary & { scenarioRuns: ScenarioRun[]; reviewNotes: ReviewNote[] }>(
      `/runs/${id}`,
      signal
    ),
  getScenarioEvents: (runId: string, scenarioId: string, signal?: AbortSignal) =>
    get<Array<{ seq: number; ts: number; type: string; payload: unknown }>>(
      `/runs/${runId}/scenarios/${scenarioId}/events`,
      signal
    ),
  createRun: (body: {
    scenarioIds: string[];
    modelId?: string;
    systemPrompt?: string;
    toolExecution?: "sequential" | "parallel";
    timeoutMs?: number;
  }) => post<{ runId: string }>("/runs", body),
  stopRun: (id: string) => post<{ ok: boolean }>(`/runs/${id}/stop`),
  clearRuns: () => post<{ ok: boolean }>("/runs/clear"),

  oneshotTests: (signal?: AbortSignal) => get<OneshotTestSummary[]>("/oneshot/tests", signal),
  startOneshot: (body: { modelId: string; promptIds: string[] }) =>
    post<{ runId: string }>("/oneshot/runs", body),
  latestOneshot: (signal?: AbortSignal) =>
    get<OneshotLatestRun | null>("/oneshot/runs/latest", signal),
};
