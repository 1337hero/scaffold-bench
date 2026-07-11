export class RunInProgressError extends Error {
  constructor(public activeRunId: string) {
    super(`Run already in progress: ${activeRunId}`);
    this.name = "RunInProgressError";
  }
}

export type RunSource = "local" | "remote";

export class RunRegistry {
  private controllers = new Map<string, AbortController>();
  private sources = new Map<string, RunSource>();
  private seqCounters = new Map<string, number>();

  // Local runs are mutually exclusive (one GPU, llama-swap); remote runs may overlap.
  create(runId: string, source: RunSource = "local"): AbortController {
    if (source === "local") {
      const localActive = this.activeLocalRunId();
      if (localActive !== null) {
        throw new RunInProgressError(localActive);
      }
    }
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    this.sources.set(runId, source);
    this.seqCounters.set(runId, 0);
    return controller;
  }

  get(runId: string): AbortController | undefined {
    return this.controllers.get(runId);
  }

  delete(runId: string): void {
    this.controllers.delete(runId);
    this.sources.delete(runId);
    this.seqCounters.delete(runId);
  }

  activeRunId(): string | null {
    return this.activeLocalRunId() ?? this.controllers.keys().next().value ?? null;
  }

  private activeLocalRunId(): string | null {
    for (const [id, source] of this.sources) {
      if (source === "local") return id;
    }
    return null;
  }

  nextSeq(runId: string): number {
    const seq = this.seqCounters.get(runId) ?? 0;
    this.seqCounters.set(runId, seq + 1);
    return seq;
  }
}

export const globalRegistry = new RunRegistry();
