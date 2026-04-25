export type OneshotEventBase = { seq: number; ts: number };

export type OneshotEvent =
  | (OneshotEventBase & {
      type: "oneshot_run_started";
      runId: string;
      promptIds: string[];
      model: string;
    })
  | (OneshotEventBase & {
      type: "oneshot_test_started";
      runId: string;
      promptId: string;
      index: number;
      total: number;
    })
  | (OneshotEventBase & { type: "oneshot_delta"; runId: string; promptId: string; content: string })
  | (OneshotEventBase & {
      type: "oneshot_test_finished";
      runId: string;
      promptId: string;
      output: string;
      metrics: { promptTokens: number; completionTokens: number } | null;
      finishReason: string;
      wallTimeMs: number;
      firstTokenMs?: number;
      error?: string;
    })
  | (OneshotEventBase & { type: "oneshot_run_finished"; runId: string })
  | (OneshotEventBase & { type: "oneshot_run_stopped"; runId: string; reason?: string })
  | (OneshotEventBase & { type: "oneshot_run_failed"; runId: string; error: string });
