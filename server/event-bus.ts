import type { PersistedEvent, OneshotEvent } from "./contracts/events.ts";

type BusEvent = PersistedEvent | OneshotEvent;
type Handler = (event: BusEvent) => void;

function getOrCreate<K, V>(map: Map<K, V>, key: K, init: () => V): V {
  let v = map.get(key);
  if (!v) map.set(key, (v = init()));
  return v;
}

export class EventBus {
  private runHandlers = new Map<string, Set<Handler>>();
  private scenarioHandlers = new Map<string, Map<string, Set<Handler>>>();

  publish(event: BusEvent): void {
    this.runHandlers.get(event.runId)?.forEach((h) => h(event));
    const scenarioId = "scenarioId" in event ? event.scenarioId : undefined;
    if (scenarioId) {
      this.scenarioHandlers.get(event.runId)?.get(scenarioId)?.forEach((h) => h(event));
    }
  }

  subscribe(runId: string, handler: Handler): () => void {
    getOrCreate(this.runHandlers, runId, () => new Set()).add(handler);
    return () => this.runHandlers.get(runId)?.delete(handler);
  }

  subscribeScenario(runId: string, scenarioId: string, handler: Handler): () => void {
    getOrCreate(
      getOrCreate(this.scenarioHandlers, runId, () => new Map<string, Set<Handler>>()),
      scenarioId,
      () => new Set()
    ).add(handler);
    return () => this.scenarioHandlers.get(runId)?.get(scenarioId)?.delete(handler);
  }

  cleanup(runId: string): void {
    this.runHandlers.delete(runId);
    this.scenarioHandlers.delete(runId);
  }
}

export const globalBus = new EventBus();
