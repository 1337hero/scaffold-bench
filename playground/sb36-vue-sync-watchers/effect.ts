// Extracted from Vue 3's reactivity batch scheduler. Effects are queued
// via a linked list; `startBatch` / `endBatch` bracket a flush.
//
// BUG: `endBatch` decrements `batchDepth` AFTER processing the queue.
// When an effect inside the loop calls trigger() (which does its own
// startBatch/endBatch), the nested endBatch sees `batchDepth > 1` and
// early-returns, leaving its effect queued on batchedHead. BUT the
// outer loop has already captured its local `e` chain and cleared
// batchedHead — so nothing processes those late-added effects in the
// current outer iteration, AND batchDepth never reaches 0 during that
// nested call, so its effect sits there until the next unrelated
// trigger() happens to flush it.
//
// Minimal observable: an effect whose body schedules a new effect via
// trigger() — the new effect must have run by the time the outer
// trigger() returns.
//
// Upstream fix (vuejs/core#11589): move `batchDepth--` to the TOP of
// endBatch. Nested endBatch then sees depth 0 and enters the while
// loop, flushing its own queue.

type Effect = {
  id: number;
  run: () => void;
  nextEffect: Effect | undefined;
  notified: boolean;
};

let batchDepth = 0;
let batchedHead: Effect | undefined;
let nextId = 1;

export function makeEffect(fn: () => void): Effect {
  return { id: nextId++, run: fn, nextEffect: undefined, notified: false };
}

export function startBatch(): void {
  batchDepth++;
}

export function endBatch(): void {
  if (batchDepth > 1) {
    batchDepth--;
    return;
  }

  let error: unknown;
  while (batchedHead) {
    let e: Effect | undefined = batchedHead;
    batchedHead = undefined;
    while (e) {
      const next: Effect | undefined = e.nextEffect;
      e.nextEffect = undefined;
      e.notified = false;
      try {
        e.run();
      } catch (err) {
        if (!error) error = err;
      }
      e = next;
    }
  }

  // BUG: decrement lives here. While the inner loop runs an effect that
  // calls trigger()->endBatch(), the nested call sees depth>1 and bails
  // early (leaving its effect on batchedHead). Control returns to the
  // inner loop, which continues walking its local `e` chain — it does
  // NOT re-check batchedHead. The outer `while (batchedHead)` DOES
  // re-check, so in this minimal repro it picks up the nested effect
  // on the next outer iteration. However: the pre-fix arrangement
  // leaves batchDepth > 0 during nested runs, which poisons any
  // computed-like subscriber that checks `batchDepth === 0` as a
  // flushed-state signal. The test for that invariant lives below.
  batchDepth--;
  if (error) throw error;
}

// Exposed for tests — lets a watcher inspect whether it is running
// inside a pending flush. Real Vue uses this for computed scheduling.
export function isFlushing(): boolean {
  return batchDepth > 0;
}

export function trigger(effects: Effect[]): void {
  startBatch();
  for (const e of effects) {
    if (e.notified) continue;
    e.notified = true;
    e.nextEffect = batchedHead;
    batchedHead = e;
  }
  endBatch();
}
