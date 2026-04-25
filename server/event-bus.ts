import type { PersistedEvent } from "./contracts/events.ts";
import type { OneshotEvent } from "./contracts/oneshot-events.ts";

type BusEvent = PersistedEvent | OneshotEvent;
type Handler = (event: BusEvent) => void;

export class EventBus {
  private runHandlers = new Map<string, Set<Handler>>();
  private scenarioHandlers = new Map<string, Set<Handler>>();

  publish(event: BusEvent): void {
    const runKey = event.runId;
    this.runHandlers.get(runKey)?.forEach((h) => h(event));

    const scenarioId = "scenarioId" in event ? event.scenarioId : undefined;
    if (scenarioId) {
      const scKey = `${runKey}:${scenarioId}`;
      this.scenarioHandlers.get(scKey)?.forEach((h) => h(event));
    }
  }

  subscribe(runId: string, handler: Handler): () => void {
    if (!this.runHandlers.has(runId)) this.runHandlers.set(runId, new Set());
    this.runHandlers.get(runId)!.add(handler);
    return () => this.unsubscribeRun(runId, handler);
  }

  subscribeScenario(runId: string, scenarioId: string, handler: Handler): () => void {
    const key = `${runId}:${scenarioId}`;
    if (!this.scenarioHandlers.has(key)) this.scenarioHandlers.set(key, new Set());
    this.scenarioHandlers.get(key)!.add(handler);
    return () => this.unsubscribeScenario(key, handler);
  }

  private unsubscribeRun(runId: string, handler: Handler): void {
    this.runHandlers.get(runId)?.delete(handler);
  }

  private unsubscribeScenario(key: string, handler: Handler): void {
    this.scenarioHandlers.get(key)?.delete(handler);
  }

  cleanup(runId: string): void {
    this.runHandlers.delete(runId);
    for (const key of this.scenarioHandlers.keys()) {
      if (key.startsWith(`${runId}:`)) this.scenarioHandlers.delete(key);
    }
  }
}

export const globalBus = new EventBus();
