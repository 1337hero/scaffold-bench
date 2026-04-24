import type { ScenarioInfo, Model, RunSummary, ReportData } from "@/types";
import type { StoredRunEvent } from "@/lib/replay";

const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; activeRunId?: string };
    const e = new Error(err.error ?? `POST ${path} → ${res.status}`) as Error & { activeRunId?: string; status: number };
    e.status = res.status;
    e.activeRunId = err.activeRunId;
    throw e;
  }
  return res.json() as Promise<T>;
}

export const api = {
  getScenarios: () => get<ScenarioInfo[]>("/scenarios"),
  getModels: () => get<{ local: Model[]; remote: Model[] }>("/models"),
  listRuns: () => get<RunSummary[]>("/runs"),
  getReportData: () => get<ReportData>("/bench-report/data"),
  activeRun: () => get<{ runId: string | null }>("/runs/active"),
  getRun: (id: string, withEvents = false) =>
    get<RunSummary & { scenarioRuns: unknown[]; events?: StoredRunEvent[] }>(`/runs/${id}${withEvents ? "?withEvents=true" : ""}`),
  getScenarioEvents: (runId: string, scenarioId: string) =>
    get<Array<{ seq: number; ts: number; type: string; payload: unknown }>>(`/runs/${runId}/scenarios/${scenarioId}/events`),
  createRun: (body: { scenarioIds: string[]; modelId?: string; endpoint?: string; apiKey?: string; systemPrompt?: string; toolExecution?: "sequential" | "parallel"; timeoutMs?: number }) =>
    post<{ runId: string }>("/runs", body),
  stopRun: (id: string) => post<{ ok: boolean }>(`/runs/${id}/stop`),
  clearRuns: () => post<{ ok: boolean }>("/runs/clear"),
};
