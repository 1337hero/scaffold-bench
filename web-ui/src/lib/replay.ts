import type { PersistedEvent } from "../types";

export type StoredRunEvent = {
  seq: number;
  ts: number;
  type: PersistedEvent["type"];
  payload: PersistedEvent;
};

export function normalizeStoredRunEvents(events: StoredRunEvent[]): PersistedEvent[] {
  return events
    .map(({ seq, ts, payload }) => ({ ...payload, seq, ts }))
    .toSorted((a, b) => a.seq - b.seq);
}

type AssistantDeltaEvent = Extract<PersistedEvent, { type: "assistant_delta" }>;

export function coalesceReplayDeltas(events: PersistedEvent[]): PersistedEvent[] {
  const replayEvents: PersistedEvent[] = [];
  let pendingDelta: AssistantDeltaEvent | undefined;

  const flushDelta = () => {
    if (!pendingDelta) return;
    replayEvents.push(pendingDelta);
    pendingDelta = undefined;
  };

  for (const event of events) {
    if (event.type !== "assistant_delta") {
      flushDelta();
      replayEvents.push(event);
      continue;
    }

    if (pendingDelta?.runId === event.runId && pendingDelta.scenarioId === event.scenarioId) {
      pendingDelta = { ...event, content: pendingDelta.content + event.content };
    } else {
      flushDelta();
      pendingDelta = event;
    }
  }

  flushDelta();
  return replayEvents;
}

export async function dispatchReplayEvents(
  events: PersistedEvent[],
  dispatch: (event: PersistedEvent) => void,
  opts: { chunkSize?: number; signal?: AbortSignal } = {}
): Promise<void> {
  const chunkSize = opts.chunkSize ?? 250;
  for (let i = 0; i < events.length; i += chunkSize) {
    if (opts.signal?.aborted) return;
    for (const event of events.slice(i, i + chunkSize)) {
      dispatch(event);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
