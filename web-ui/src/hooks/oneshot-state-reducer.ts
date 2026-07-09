import type { OneshotEvent, OneshotLatestRun } from "@/types";

export type OneshotPromptStatus = "pending" | "running" | "done" | "failed" | "stopped";

export type OneshotPromptState = {
  id: string;
  status: OneshotPromptStatus;
  output: string;
  model?: string | null;
  artifact?: boolean;
  artifactVersion?: number;
  finishReason?: string;
  wallTimeMs?: number;
  firstTokenMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
};

export type OneshotState = {
  runId: string | null;
  status: "idle" | "running" | "done" | "failed" | "stopped";
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
    const runIsLive = latest.status === "running";
    const prompts: Record<string, OneshotPromptState> = {};
    for (const id of latest.promptIds) {
      prompts[id] = { id, status: "pending", output: "" };
    }
    // Results are latest-per-prompt across runs; count only the live run's rows
    // toward lastSeenSeq so replayed SSE events are not dropped.
    let lastSeenSeq = 0;
    for (const row of latest.results) {
      const isFinished =
        row.finishedAt != null || row.status === "done" || row.status === "failed";
      const belongsToRun = row.runId === latest.runId;
      const status: OneshotPromptStatus = isFinished
        ? row.error
          ? "failed"
          : "done"
        : runIsLive && belongsToRun
          ? row.status === "running"
            ? "running"
            : "pending"
          : "stopped";
      prompts[row.promptId] = {
        id: row.promptId,
        status,
        output: row.output ?? "",
        model: row.model,
        artifact: row.artifact,
        artifactVersion: row.finishedAt ?? undefined,
        finishReason: row.finishReason ?? undefined,
        wallTimeMs: row.wallTimeMs ?? undefined,
        firstTokenMs: row.firstTokenMs ?? undefined,
        promptTokens: row.promptTokens ?? undefined,
        completionTokens: row.completionTokens ?? undefined,
        error: row.error ?? undefined,
      };
      if (belongsToRun && (row.startedAt != null || isFinished)) lastSeenSeq++;
    }
    return {
      runId: latest.runId,
      status:
        latest.status === "done"
          ? "done"
          : latest.status === "failed"
            ? "failed"
            : latest.status === "stopped"
              ? "stopped"
              : "running",
      model: latest.model,
      promptIds: [...latest.promptIds],
      prompts,
      lastSeenSeq,
    };
  }

  if (event.type !== "oneshot_run_started" && event.seq <= state.lastSeenSeq) return state;

  if (event.type === "oneshot_run_started") {
    // Merge: only the prompts in this run reset; other prompts keep their results.
    const prompts = { ...state.prompts };
    for (const id of event.promptIds) {
      prompts[id] = { id, status: "pending", output: "", model: event.model };
    }
    const promptIds = [...new Set([...state.promptIds, ...event.promptIds])];
    return {
      runId: event.runId,
      status: "running",
      model: event.model,
      promptIds,
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
        [event.promptId]: { ...current, status: "running", output: "" },
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
          model: current.model ?? state.model,
          artifact: event.artifact ?? false,
          artifactVersion: Date.now(),
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

  if (event.type === "oneshot_run_stopped") {
    return { ...state, status: "stopped", lastSeenSeq: event.seq };
  }

  return { ...state, status: "failed", lastSeenSeq: event.seq };
}
