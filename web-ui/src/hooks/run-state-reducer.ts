import type { PersistedEvent, RunState, ScenarioState, LogEntry } from "@/types";

export type ReducerState = RunState & { _nextLogId: number };

export const INITIAL_REDUCER_STATE: ReducerState = {
  runId: null,
  status: "idle",
  scenarios: [],
  activeScenarioId: null,
  focusedScenarioId: null,
  totalPoints: 0,
  maxPoints: 0,
  _nextLogId: 1,
};

export type Action = PersistedEvent | { type: "_focus"; id: string } | { type: "_reset" };

function formatTime(ts: number): string {
  return new Date(ts).toISOString().substring(11, 19);
}

function toolLabel(name: string): string {
  if (["bash", "execute_bash", "run_bash", "computer"].includes(name)) return "cmd";
  if (
    ["edit", "write", "str_replace_editor", "str_replace", "create_file", "write_file"].includes(
      name
    )
  )
    return "edit";
  return "tool";
}

function updateScenario(
  scenarios: ScenarioState[],
  id: string,
  updater: (s: ScenarioState) => ScenarioState
): ScenarioState[] {
  return scenarios.map((s) => (s.id === id ? updater(s) : s));
}

function makeAssistantEntry(id: number, text: string, ts: number): LogEntry {
  return {
    id,
    kind: "assistant",
    label: "assistant",
    text,
    time: formatTime(ts),
  };
}

export function reducer(state: ReducerState, action: Action): ReducerState {
  if (action.type === "_focus") {
    return { ...state, focusedScenarioId: action.id };
  }
  if (action.type === "_reset") {
    return INITIAL_REDUCER_STATE;
  }

  const event = action as PersistedEvent;

  switch (event.type) {
    case "run_started": {
      const scenarios: ScenarioState[] = event.scenarioIds.map((id) => ({
        id,
        name: id,
        category: "",
        maxPoints: 0,
        status: "pending" as const,
        toolCallCount: 0,
        bashCallCount: 0,
        editCallCount: 0,
        logs: [],
        streamBuffer: "",
      }));
      return {
        ...INITIAL_REDUCER_STATE,
        runId: event.runId,
        status: "running",
        startedAt: event.ts,
        scenarios,
        model: event.model,
        _nextLogId: state._nextLogId,
      };
    }

    case "scenario_started": {
      const scenarios = updateScenario(state.scenarios, event.scenarioId, (s) => ({
        ...s,
        name: event.name ?? event.scenarioId,
        category: event.category,
        maxPoints: event.maxPoints,
        status: "running" as const,
        startedAt: event.ts,
        finishedAt: undefined,
        points: undefined,
        wallTimeMs: undefined,
        toolCallCount: 0,
        bashCallCount: 0,
        editCallCount: 0,
        firstTokenMs: undefined,
        turnWallTimes: undefined,
        turnFirstTokenMs: undefined,
        evaluation: undefined,
        logs: [],
        streamBuffer: "",
      }));
      const userHasFocused =
        state.activeScenarioId !== null &&
        state.focusedScenarioId !== null &&
        state.focusedScenarioId !== state.activeScenarioId;
      return {
        ...state,
        scenarios,
        activeScenarioId: event.scenarioId,
        focusedScenarioId: userHasFocused ? state.focusedScenarioId : event.scenarioId,
      };
    }

    case "scenario_finished": {
      let bump = 0;
      const scenarios = updateScenario(state.scenarios, event.scenarioId, (s) => {
        const flushed = s.streamBuffer.trim();
        const flushEntry = flushed ? makeAssistantEntry(state._nextLogId, flushed, event.ts) : null;
        if (flushEntry) bump += 1;
        return {
          ...s,
          status: event.status,
          points: event.points,
          wallTimeMs: event.wallTimeMs,
          toolCallCount: event.toolCallCount,
          firstTokenMs: event.firstTokenMs ?? s.firstTokenMs,
          turnWallTimes: event.turnWallTimes ?? s.turnWallTimes,
          turnFirstTokenMs: event.turnFirstTokenMs ?? s.turnFirstTokenMs,
          evaluation: event.evaluation,
          finishedAt: event.ts,
          liveMetrics: event.modelMetrics ?? s.liveMetrics,
          streamBuffer: "",
          logs: flushEntry ? [...s.logs, flushEntry] : s.logs,
        };
      });
      return {
        ...state,
        scenarios,
        activeScenarioId:
          state.activeScenarioId === event.scenarioId ? null : state.activeScenarioId,
        _nextLogId: state._nextLogId + bump,
      };
    }

    case "assistant_delta": {
      return {
        ...state,
        scenarios: updateScenario(state.scenarios, event.scenarioId, (s) => ({
          ...s,
          streamBuffer: s.streamBuffer + event.content,
          firstTokenMs:
            s.firstTokenMs !== undefined || event.content.trim().length === 0 || !s.startedAt
              ? s.firstTokenMs
              : Math.max(0, event.ts - s.startedAt),
        })),
      };
    }

    case "assistant": {
      let bump = 0;
      const scenarios = updateScenario(state.scenarios, event.scenarioId, (s) => {
        const finalText = (s.streamBuffer || event.content).trim();
        const entry = finalText ? makeAssistantEntry(state._nextLogId, finalText, event.ts) : null;
        if (entry) bump += 1;
        return {
          ...s,
          streamBuffer: "",
          logs: entry ? [...s.logs, entry] : s.logs,
        };
      });
      return {
        ...state,
        scenarios,
        _nextLogId: state._nextLogId + bump,
      };
    }

    case "tool_call": {
      const label = toolLabel(event.call.name);
      let text = event.call.name;
      try {
        const args =
          typeof event.call.args === "string"
            ? (JSON.parse(event.call.args) as Record<string, unknown>)
            : (event.call.args as Record<string, unknown>);
        if (label === "cmd" && args["command"]) text = `$ ${args["command"]}`;
        else if (label === "edit" && args["path"]) text = `${event.call.name} ${args["path"]}`;
        else text = `${event.call.name}(${JSON.stringify(args).slice(0, 80)})`;
      } catch {
        // keep default
      }
      let bump = 0;
      const scenarios = updateScenario(state.scenarios, event.scenarioId, (s) => {
        const flushed = s.streamBuffer.trim();
        const flushEntry = flushed ? makeAssistantEntry(state._nextLogId, flushed, event.ts) : null;
        if (flushEntry) bump += 1;
        const toolEntry: LogEntry = {
          id: state._nextLogId + bump,
          kind: "tool",
          label,
          text,
          time: formatTime(event.ts),
        };
        bump += 1;
        return {
          ...s,
          streamBuffer: "",
          toolCallCount: (s.toolCallCount ?? 0) + 1,
          bashCallCount: label === "cmd" ? (s.bashCallCount ?? 0) + 1 : s.bashCallCount,
          editCallCount: label === "edit" ? (s.editCallCount ?? 0) + 1 : s.editCallCount,
          logs: [...s.logs, ...(flushEntry ? [flushEntry] : []), toolEntry],
        };
      });
      return {
        ...state,
        scenarios,
        _nextLogId: state._nextLogId + bump,
      };
    }

    case "tool_result": {
      const result = event.result ?? "";
      const isError = /^error:/i.test(result);
      const entry: LogEntry = {
        id: state._nextLogId,
        kind: isError ? "stderr" : "stdout",
        label: isError ? "stderr" : "stdout",
        text: result.slice(0, 500),
        time: formatTime(event.ts),
      };
      return {
        ...state,
        scenarios: updateScenario(state.scenarios, event.scenarioId, (s) => ({
          ...s,
          logs: [...s.logs, entry],
        })),
        _nextLogId: state._nextLogId + 1,
      };
    }

    case "model_metrics": {
      return {
        ...state,
        globalMetrics: event.metrics,
        scenarios: updateScenario(state.scenarios, event.scenarioId, (s) => ({
          ...s,
          liveMetrics: event.metrics,
        })),
      };
    }

    case "run_finished": {
      return {
        ...state,
        status: "done",
        totalPoints: event.totalPoints,
        maxPoints: event.maxPoints,
      };
    }

    case "run_stopped":
      return { ...state, status: "stopped" };

    case "run_failed":
      return { ...state, status: "failed" };

    default:
      return state;
  }
}
