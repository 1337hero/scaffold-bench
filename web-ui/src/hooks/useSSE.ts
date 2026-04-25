import { useEffect, useRef } from "react";
import type { PersistedEvent } from "@/types";

const TERMINAL_TYPES = new Set(["run_finished", "run_stopped", "run_failed"]);
const DELTA_FLUSH_MS = 33;

export type StreamDebugStats = {
  eventsPerSec: number;
  deltaCharsPerSec: number;
  lastEventTs: number | null;
  connectionState: "idle" | "connecting" | "open" | "error" | "closed";
};

type DeltaBucket = {
  seq: number;
  ts: number;
  runId: string;
  scenarioId: string;
  content: string;
};

export function useSSE(
  runId: string | null,
  onEvent: (event: PersistedEvent) => void,
  onStats?: (stats: StreamDebugStats) => void
): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;

  useEffect(() => {
    if (!runId) {
      onStatsRef.current?.({
        eventsPerSec: 0,
        deltaCharsPerSec: 0,
        lastEventTs: null,
        connectionState: "idle",
      });
      return;
    }

    let connectionState: StreamDebugStats["connectionState"] = "connecting";
    const es = new EventSource(`/api/runs/${runId}/stream?fromSeq=0`);
    const pendingDeltas = new Map<string, DeltaBucket>();
    let lastSeq = -1;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let eventsInWindow = 0;
    let deltaCharsInWindow = 0;
    let lastEventTs: number | null = null;

    const emitStats = () => {
      onStatsRef.current?.({
        eventsPerSec: eventsInWindow,
        deltaCharsPerSec: deltaCharsInWindow,
        lastEventTs,
        connectionState,
      });
      eventsInWindow = 0;
      deltaCharsInWindow = 0;
    };

    const statsInterval = setInterval(emitStats, 1000);

    const dispatchEvent = (event: PersistedEvent) => {
      eventsInWindow += 1;
      if (event.type === "assistant_delta") {
        deltaCharsInWindow += event.content.length;
      }
      lastEventTs = Date.now();
      onEventRef.current(event);
    };

    const flushPendingDeltas = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (pendingDeltas.size === 0) return;

      const batched = [...pendingDeltas.values()].toSorted((a, b) => a.seq - b.seq);
      pendingDeltas.clear();
      for (const delta of batched) {
        dispatchEvent({
          type: "assistant_delta",
          seq: delta.seq,
          ts: delta.ts,
          runId: delta.runId,
          scenarioId: delta.scenarioId,
          content: delta.content,
        });
      }
    };

    const scheduleDeltaFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(flushPendingDeltas, DELTA_FLUSH_MS);
    };

    const handleMessage = (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as PersistedEvent;
        if (parsed.seq <= lastSeq) return;
        lastSeq = parsed.seq;

        if (parsed.type === "assistant_delta") {
          const key = `${parsed.runId}:${parsed.scenarioId}`;
          const existing = pendingDeltas.get(key);
          if (existing) {
            existing.content += parsed.content;
            existing.seq = parsed.seq;
            existing.ts = parsed.ts;
          } else {
            pendingDeltas.set(key, {
              seq: parsed.seq,
              ts: parsed.ts,
              runId: parsed.runId,
              scenarioId: parsed.scenarioId,
              content: parsed.content,
            });
          }
          scheduleDeltaFlush();
          return;
        }

        flushPendingDeltas();
        dispatchEvent(parsed);
        if (TERMINAL_TYPES.has(parsed.type)) {
          es.close();
        }
      } catch (error) {
        console.warn("Ignoring malformed SSE event", error);
      }
    };

    const EVENT_TYPES: PersistedEvent["type"][] = [
      "run_started",
      "run_finished",
      "run_stopped",
      "run_failed",
      "scenario_started",
      "scenario_finished",
      "assistant",
      "assistant_delta",
      "tool_call",
      "tool_result",
      "model_metrics",
    ];

    for (const type of EVENT_TYPES) {
      es.addEventListener(type, handleMessage);
    }

    es.addEventListener("message", handleMessage);
    es.addEventListener("open", () => {
      connectionState = "open";
    });
    es.addEventListener("error", () => {
      connectionState = "error";
    });

    return () => {
      connectionState = "closed";
      flushPendingDeltas();
      if (flushTimer) clearTimeout(flushTimer);
      clearInterval(statsInterval);
      emitStats();
      es.close();
    };
  }, [runId]);
}
