import { useReducer, useCallback } from "react";
import type { PersistedEvent } from "@/types";
import { reducer, INITIAL_REDUCER_STATE } from "./run-state-reducer";

export function useRunState() {
  const [state, rawDispatch] = useReducer(reducer, INITIAL_REDUCER_STATE);

  const dispatch = useCallback((event: PersistedEvent) => {
    rawDispatch(event);
  }, []);

  const focusScenario = useCallback((id: string) => {
    rawDispatch({ type: "_focus", id });
  }, []);

  const resetRun = useCallback(() => {
    rawDispatch({ type: "_reset" });
  }, []);

  const startRun = useCallback((runId: string, scenarioIds: string[]) => {
    rawDispatch({
      seq: 0,
      ts: Date.now(),
      type: "run_started",
      runId,
      scenarioIds,
      model: null,
      endpoint: null,
    });
  }, []);

  return { state, dispatch, focusScenario, resetRun, startRun };
}
