import type { OneshotEvent, OneshotLatestRun } from "@/types";

export type OneshotPromptStatus = "pending" | "running" | "done" | "failed";

export type OneshotPromptState = {
  id: string;
  status: OneshotPromptStatus;
  output: string;
  finishReason?: string;
  wallTimeMs?: number;
  firstTokenMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
};

export type OneshotState = {
  runId: string | null;
  status: "idle" | "running" | "done" | "failed";
  model: string | null;
  promptIds: string[];
  prompts: Record<string, OneshotPromptState>;
  lastSeenSeq: number;
};

export const INITIAL_ONESHOT_STATE: OneshotState = {
  runId: null,
  status: "idle",
  model: null,
  promptIds: [],
  prompts: {},
  lastSeenSeq: -1,
};

type HydrateAction = { type: "hydrate"; latest: OneshotLatestRun };

export function oneshotStateReducer(
  state: OneshotState,
  event: OneshotEvent | HydrateAction
): OneshotState {
  if (event.type === "hydrate") {
    const { latest } = event;
    const prompts: Record<string, OneshotPromptState> = {};
    for (const id of latest.promptIds) {
      prompts[id] = { id, status: "pending", output: "" };
    }
    let lastSeenSeq = 0;
    for (const row of latest.results) {
      const hasStarted =
        row.startedAt != null || row.status != null || row.output != null || row.error != null;
      if (!hasStarted) continue;
      prompts[row.promptId] = {
        ...prompts[row.promptId],
        id: row.promptId,
        status: "running",
        output: row.output ?? "",
      };
      const isFinished =
        row.finishedAt != null ||
        row.status === "done" ||
        row.status === "failed" ||
        row.error != null;
      if (isFinished) {
        prompts[row.promptId] = {
          ...prompts[row.promptId],
          status: row.error ? "failed" : "done",
          output: row.output ?? "",
          finishReason: row.finishReason ?? undefined,
          wallTimeMs: row.wallTimeMs ?? undefined,
          firstTokenMs: row.firstTokenMs ?? undefined,
          promptTokens: row.promptTokens ?? undefined,
          completionTokens: row.completionTokens ?? undefined,
          error: row.error ?? undefined,
        };
      }
      lastSeenSeq++;
    }
    return {
      runId: latest.runId,
      status: latest.status === "done" ? "done" : latest.status === "failed" ? "failed" : "running",
      model: latest.model,
      promptIds: [...latest.promptIds],
      prompts,
      lastSeenSeq,
    };
  }

  if (event.type !== "oneshot_run_started" && event.seq <= state.lastSeenSeq) return state;

  if (event.type === "oneshot_run_started") {
    const prompts: Record<string, OneshotPromptState> = {};
    for (const id of event.promptIds) {
      prompts[id] = { id, status: "pending", output: "" };
    }
    return {
      runId: event.runId,
      status: "running",
      model: event.model,
      promptIds: [...event.promptIds],
      prompts,
      lastSeenSeq: event.seq,
    };
  }

  if (event.type === "oneshot_test_started") {
    const current = state.prompts[event.promptId] ?? {
      id: event.promptId,
      status: "pending",
      output: "",
    };
    return {
      ...state,
      prompts: {
        ...state.prompts,
        [event.promptId]: { ...current, status: "running" },
      },
      lastSeenSeq: event.seq,
    };
  }

  if (event.type === "oneshot_delta") {
    const current = state.prompts[event.promptId] ?? {
      id: event.promptId,
      status: "running",
      output: "",
    };
    return {
      ...state,
      prompts: {
        ...state.prompts,
        [event.promptId]: { ...current, output: `${current.output}${event.content}` },
      },
      lastSeenSeq: event.seq,
    };
  }

  if (event.type === "oneshot_test_finished") {
    const current = state.prompts[event.promptId] ?? {
      id: event.promptId,
      status: "running",
      output: "",
    };

    return {
      ...state,
      prompts: {
        ...state.prompts,
        [event.promptId]: {
          ...current,
          status: event.error ? "failed" : "done",
          output: event.output,
          finishReason: event.finishReason,
          wallTimeMs: event.wallTimeMs,
          firstTokenMs: event.firstTokenMs,
          promptTokens: event.metrics?.promptTokens,
          completionTokens: event.metrics?.completionTokens,
          error: event.error,
        },
      },
      lastSeenSeq: event.seq,
    };
  }

  if (event.type === "oneshot_run_finished") {
    return { ...state, status: "done", lastSeenSeq: event.seq };
  }

  return { ...state, status: "failed", lastSeenSeq: event.seq };
}
