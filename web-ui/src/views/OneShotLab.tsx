import { useEffect, useMemo, useReducer, useState, type Dispatch } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/Panel";
import { api } from "@/api/client";
import { OneshotControls } from "@/components/OneshotControls";
import { OneshotQueue } from "@/components/OneshotQueue";
import { OneshotCanvas } from "@/components/OneshotCanvas";
import { OneshotMetadata } from "@/components/OneshotMetadata";
import { INITIAL_ONESHOT_STATE, oneshotStateReducer } from "@/hooks/oneshot-state-reducer";
import { useOneshotSSE } from "@/hooks/useOneshotSSE";
import type { OneshotEvent, OneshotLatestRun } from "@/types";

export function OneShotLab() {
  const [state, dispatch] = useReducer(oneshotStateReducer, INITIAL_ONESHOT_STATE);
  const [focusedPromptId, setFocusedPromptId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [streamHasError, setStreamHasError] = useState(false);

  const testsQuery = useQuery({
    queryKey: ["oneshot-tests"],
    queryFn: ({ signal }) => api.oneshotTests(signal),
  });

  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: ({ signal }) => api.getModels(signal),
  });

  const latestQuery = useQuery({
    queryKey: ["oneshot-latest"],
    queryFn: ({ signal }) => api.latestOneshot(signal),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    refetchInterval: () => {
      if (!state.runId || state.status !== "running" || !streamHasError) return false;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return false;
      return 3_000;
    },
  });

  useEffect(() => {
    const latest = latestQuery.data;
    if (!latest || state.runId) return;
    hydrateLatestRun(latest, dispatch);
  }, [latestQuery.data, state.runId]);

  useEffect(() => {
    if (state.status !== "running") setStreamHasError(false);
  }, [state.status]);

  useOneshotSSE(state.runId, dispatch, {
    onOpen: () => setStreamHasError(false),
    onError: () => setStreamHasError(true),
  });

  useEffect(() => {
    if (!streamHasError || !state.runId || state.status !== "running") return;
    void latestQuery.refetch();
  }, [streamHasError, state.runId, state.status, latestQuery]);

  const allModels = useMemo(
    () => [...(modelsQuery.data?.local ?? []), ...(modelsQuery.data?.remote ?? [])],
    [modelsQuery.data]
  );

  const runMutation = useMutation({
    mutationFn: api.startOneshot,
    onSuccess: ({ runId }, variables) => {
      dispatch({
        type: "oneshot_run_started",
        runId,
        promptIds: variables.promptIds,
        model: variables.modelId,
        seq: Date.now(),
      });
      setFocusedPromptId(variables.promptIds[0] ?? null);
    },
  });

  const prompts = testsQuery.data ?? [];

  const runAll = () => {
    if (!selectedModelId || prompts.length === 0) return;
    const promptIds = prompts.map((p) => p.id);
    runMutation.mutate({ modelId: selectedModelId, promptIds });
  };

  const rerunSingle = (promptId: string) => {
    if (!selectedModelId) return;
    runMutation.mutate({ modelId: selectedModelId, promptIds: [promptId] });
  };

  const focusedId = focusedPromptId ?? state.promptIds[0] ?? prompts[0]?.id ?? null;
  const focusedPrompt = focusedId ? state.prompts[focusedId] : undefined;

  return (
    <div className="min-h-screen bg-bg-main text-text-main font-mono p-4 md:px-6 md:pt-6 pb-6 text-[13px] leading-[1.4]">
      <div className="mb-4 pb-4 border-b border-border-main flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight text-text-main leading-none">
          ONE-SHOT <span className="text-gold">LAB</span>
        </h1>
        <span className="text-xs text-text-dim uppercase">Unscored · vibe check</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-4 space-y-4">
          <Panel title="Test Queue" rightTag={`${prompts.length} prompts`}>
            <OneshotControls
              prompts={prompts}
              models={allModels}
              selectedModelId={selectedModelId}
              running={state.status === "running" || runMutation.isPending}
              focusedPromptId={focusedId}
              onModelChange={setSelectedModelId}
              onStartAll={runAll}
              onRerunAll={runAll}
              onRerunSingle={rerunSingle}
            />
            {testsQuery.isError ? (
              <div className="p-3 text-xs text-red-main">Failed to load oneshot prompts.</div>
            ) : (
              <OneshotQueue
                prompts={prompts}
                rows={state.prompts}
                focusedPromptId={focusedId}
                onFocus={setFocusedPromptId}
              />
            )}
          </Panel>

          <Panel title="Metadata" rightTag={state.status.toUpperCase()}>
            {streamHasError && state.status === "running" ? (
              <div className="px-2 pb-2 text-[11px] text-red-main">
                Live stream interrupted. Recovering from latest snapshot…
              </div>
            ) : null}
            <OneshotMetadata model={state.model} promptId={focusedId} metrics={focusedPrompt} />
          </Panel>
        </div>

        <div className="md:col-span-8">
          <Panel title="Canvas" rightTag={focusedId ?? "—"} className="min-h-[72vh]">
            <OneshotCanvas text={focusedPrompt?.output ?? ""} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function hydrateLatestRun(latest: OneshotLatestRun, dispatch: Dispatch<OneshotEvent>) {
  dispatch({
    type: "oneshot_run_started",
    runId: latest.runId,
    promptIds: latest.promptIds,
    model: latest.model ?? "unknown",
    seq: 1,
  });

  let seq = 2;

  for (const [index, row] of latest.results.entries()) {
    const hasStarted =
      row.startedAt != null || row.status != null || row.output != null || row.error != null;
    if (!hasStarted) continue;

    dispatch({
      type: "oneshot_test_started",
      runId: latest.runId,
      promptId: row.promptId,
      index,
      total: latest.promptIds.length,
      seq: seq++,
    });

    if (row.output) {
      dispatch({
        type: "oneshot_delta",
        runId: latest.runId,
        promptId: row.promptId,
        content: row.output,
        seq: seq++,
      });
    }

    const isFinished =
      row.finishedAt != null ||
      row.status === "done" ||
      row.status === "failed" ||
      row.error != null;
    if (!isFinished) continue;

    dispatch({
      type: "oneshot_test_finished",
      runId: latest.runId,
      promptId: row.promptId,
      output: row.output ?? "",
      metrics:
        row.promptTokens != null || row.completionTokens != null
          ? {
              promptTokens: row.promptTokens ?? 0,
              completionTokens: row.completionTokens ?? 0,
            }
          : null,
      finishReason: row.finishReason ?? "",
      wallTimeMs: row.wallTimeMs ?? 0,
      firstTokenMs: row.firstTokenMs ?? undefined,
      error: row.error ?? undefined,
      seq: seq++,
    });
  }

  if (latest.status === "done") {
    dispatch({ type: "oneshot_run_finished", runId: latest.runId, seq });
    return;
  }

  if (latest.status === "failed") {
    dispatch({
      type: "oneshot_run_failed",
      runId: latest.runId,
      error: latest.error ?? "Run failed",
      seq,
    });
  }
}
