import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { StatusBar } from "@/components/StatusBar";
import { ScenarioQueue } from "@/components/ScenarioQueue";
import { LogTerminal } from "@/components/LogTerminal";
import { MetricsPanel } from "@/components/MetricsPanel";
import { VerificationPanel } from "@/components/VerificationPanel";
import { useSSE, type StreamDebugStats } from "@/hooks/useSSE";
import { useRunState } from "@/hooks/useRunState";
import { useElapsedTimer } from "@/hooks/useElapsedTimer";
import { useShortcuts } from "@/hooks/useShortcuts";
import { api } from "@/api/client";
import { coalesceReplayDeltas, dispatchReplayEvents, normalizeStoredRunEvents } from "@/lib/replay";
import {
  getFocusedScenario,
  getCategoryRollups,
  getDisplayedPoints,
  getModel,
  getCallCounts,
  isRunComplete,
} from "./dashboard-selectors";

const REPLAY_CHUNK_SIZE = 250;
const HEALTH_REFETCH_MS = 5_000;

function useApiStatus(): "checking" | "ok" | "error" {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/health", { signal });
      if (!response.ok) throw new Error("Health check failed");
      return true;
    },
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState !== "visible"
        ? false
        : HEALTH_REFETCH_MS,
    retry: false,
  });

  if (health.isPending) return "checking";
  if (health.isError) return "error";
  return "ok";
}

interface DashboardProps {
  onHistory: () => void;
  onOneshot: () => void;
  onStartRun: () => void;
  activeRunId: string | null;
  initialRunId?: string;
  historyHref: string;
  oneshotHref: string;
}

export function Dashboard({
  onHistory,
  onOneshot,
  onStartRun,
  activeRunId,
  initialRunId,
  historyHref,
  oneshotHref,
}: DashboardProps) {
  const { state, dispatch, focusScenario, resetRun } = useRunState();
  const queryClient = useQueryClient();
  const apiStatus = useApiStatus();
  const [streamStats, setStreamStats] = useState<StreamDebugStats>({
    eventsPerSec: 0,
    deltaCharsPerSec: 0,
    lastEventTs: null,
    connectionState: "idle",
  });

  const isReplay = !!initialRunId;
  const sseRunId = isReplay ? null : activeRunId;
  const replayRun = useQuery({
    queryKey: ["run", initialRunId, "events"],
    queryFn: ({ signal }) => api.getRun(initialRunId!, true, signal),
    enabled: isReplay,
  });

  useSSE(sseRunId, dispatch, setStreamStats);

  useEffect(() => {
    if (isReplay) return;
    resetRun();
  }, [sseRunId, isReplay, resetRun]);

  useEffect(() => {
    if (!initialRunId || !replayRun.data?.events) return;
    const controller = new AbortController();
    resetRun();
    const events = coalesceReplayDeltas(normalizeStoredRunEvents(replayRun.data.events));
    void dispatchReplayEvents(events, dispatch, {
      chunkSize: REPLAY_CHUNK_SIZE,
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [initialRunId, replayRun.data?.events, dispatch, resetRun]);

  const elapsed = useElapsedTimer(state.status, state.startedAt);

  const stopMutation = useMutation({
    mutationFn: (runId: string) => api.stopRun(runId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["active-run"] });
      const previous = queryClient.getQueryData<{ runId: string | null }>(["active-run"]);
      queryClient.setQueryData(["active-run"], { runId: null });
      return { previous };
    },
    onError: (_error, _runId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["active-run"], context.previous);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["active-run"] });
    },
  });

  const handleStop = () => {
    const runId = state.runId ?? activeRunId;
    if (state.status === "running" && runId) {
      stopMutation.mutate(runId);
    }
  };

  useShortcuts({ s: handleStop });

  const focusedScenario = getFocusedScenario(state);
  const focusedId = state.focusedScenarioId ?? state.activeScenarioId;
  const isLive = state.status === "running" && focusedId === state.activeScenarioId;
  const metrics = focusedScenario?.liveMetrics ?? state.globalMetrics;
  const callCounts = getCallCounts(focusedScenario);
  const categoryRollups = getCategoryRollups(state);
  const displayed = getDisplayedPoints(state);
  const model = getModel(state, focusedScenario);
  const runComplete = isRunComplete(state.status);

  return (
    <div className="min-h-screen bg-bg-main text-text-main font-mono p-4 md:px-6 md:pt-6 pb-0 flex flex-col h-screen overflow-hidden text-[13px] leading-[1.4] selection:bg-gold-dim selection:text-bg-main">
      <Header
        totalPoints={displayed.total}
        maxPoints={displayed.max}
        elapsed={elapsed}
        status={state.status}
        onStart={onStartRun}
        onStop={handleStop}
        onHistory={onHistory}
        onOneshot={onOneshot}
        historyHref={historyHref}
        oneshotHref={oneshotHref}
      />
      {stopMutation.isError ? (
        <div className="text-[11px] text-red-main mt-1">
          Stop failed:{" "}
          {stopMutation.error instanceof Error ? stopMutation.error.message : "unknown"}
        </div>
      ) : null}

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-3 min-h-0">
          <ScenarioQueue scenarios={state.scenarios} focusedId={focusedId} onFocus={focusScenario} />
        </div>

        <div className="md:col-span-6 min-h-0">
          <LogTerminal scenario={focusedScenario} isLive={isLive} />
        </div>

        <div className="md:col-span-3 flex flex-col gap-4 min-h-0">
          <MetricsPanel
            metrics={metrics}
            toolCount={callCounts.tool}
            bashCalls={callCounts.bash}
            editCalls={callCounts.edit}
            firstTokenMs={focusedScenario?.firstTokenMs}
            turnWallTimes={focusedScenario?.turnWallTimes}
            turnFirstTokenMs={focusedScenario?.turnFirstTokenMs}
          />
          <VerificationPanel
            scenario={focusedScenario}
            isRunComplete={runComplete}
            categoryRollups={categoryRollups}
            totalPoints={displayed.total}
            maxPoints={displayed.max}
          />
        </div>
      </div>

      <StatusBar
        model={model}
        apiStatus={apiStatus}
        runStatus={state.status}
        streamStats={streamStats}
      />
    </div>
  );
}
