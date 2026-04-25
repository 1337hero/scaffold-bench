import type { OneshotEvent } from "@/types";

const MAX_SEEN_SEQ = 5_000;

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
  seenSeq: Set<number>;
};

export const INITIAL_ONESHOT_STATE: OneshotState = {
  runId: null,
  status: "idle",
  model: null,
  promptIds: [],
  prompts: {},
  seenSeq: new Set<number>(),
};

export function oneshotStateReducer(state: OneshotState, event: OneshotEvent): OneshotState {
  if (event.type !== "oneshot_run_started" && state.seenSeq.has(event.seq)) return state;

  const nextSeen = rememberSeq(state.seenSeq, event.seq);

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
      seenSeq: new Set([event.seq]),
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
      seenSeq: nextSeen,
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
      seenSeq: nextSeen,
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
      seenSeq: nextSeen,
    };
  }

  if (event.type === "oneshot_run_finished") {
    return { ...state, status: "done", seenSeq: nextSeen };
  }

  return { ...state, status: "failed", seenSeq: nextSeen };
}

function rememberSeq(previous: Set<number>, seq: number): Set<number> {
  const next = new Set(previous);
  next.add(seq);
  const overflow = next.size - MAX_SEEN_SEQ;
  if (overflow <= 0) return next;

  let dropped = 0;
  for (const value of next) {
    next.delete(value);
    dropped += 1;
    if (dropped === overflow) break;
  }

  return next;
}
