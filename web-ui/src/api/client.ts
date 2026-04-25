import type {
  ScenarioInfo,
  Model,
  RunSummary,
  ReportData,
  OneshotLatestRun,
  OneshotTestSummary,
} from "@/types";
import type { StoredRunEvent } from "@/lib/replay";

const BASE = "/api";

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
    const e = new Error(err.error ?? `POST ${path} → ${res.status}`) as Error & {
      activeRunId?: string;
      status: number;
    };
    e.status = res.status;
    e.activeRunId = err.activeRunId;
    throw e;
  }
  return res.json() as Promise<T>;
}

export const api = {
  getScenarios: (signal?: AbortSignal) => get<ScenarioInfo[]>("/scenarios", signal),
  getModels: (signal?: AbortSignal) => get<{ local: Model[]; remote: Model[] }>("/models", signal),
  listRuns: (signal?: AbortSignal) => get<RunSummary[]>("/runs", signal),
  getReportData: (signal?: AbortSignal) => get<ReportData>("/bench-report/data", signal),
  activeRun: (signal?: AbortSignal) => get<{ runId: string | null }>("/runs/active", signal),
  getRun: (id: string, withEvents = false, signal?: AbortSignal) =>
    get<RunSummary & { scenarioRuns: unknown[]; events?: StoredRunEvent[] }>(
      `/runs/${id}${withEvents ? "?withEvents=true" : ""}`,
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
  latestOneshot: (signal?: AbortSignal) => get<OneshotLatestRun | null>("/oneshot/runs/latest", signal),
};
