export class RunInProgressError extends Error {
  constructor(public activeRunId: string) {
    super(`Run already in progress: ${activeRunId}`);
    this.name = "RunInProgressError";
  }
}

export class RunRegistry {
  private controllers = new Map<string, AbortController>();
  private _activeRunId: string | null = null;
  private seqCounters = new Map<string, number>();

  create(runId: string): AbortController {
    if (this._activeRunId !== null) {
      throw new RunInProgressError(this._activeRunId);
    }
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    this.seqCounters.set(runId, 0);
    this._activeRunId = runId;
    return controller;
  }

  get(runId: string): AbortController | undefined {
    return this.controllers.get(runId);
  }

  delete(runId: string): void {
    this.controllers.delete(runId);
    this.seqCounters.delete(runId);
    if (this._activeRunId === runId) this._activeRunId = null;
  }

  activeRunId(): string | null {
    return this._activeRunId;
  }

  nextSeq(runId: string): number {
    const seq = this.seqCounters.get(runId) ?? 0;
    this.seqCounters.set(runId, seq + 1);
    return seq;
  }
}

export const globalRegistry = new RunRegistry();
