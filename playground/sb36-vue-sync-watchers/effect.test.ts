import { strict as assert } from "node:assert";
import { makeEffect, trigger, isFlushing } from "./effect.ts";

// Case 1 — a single effect runs when triggered.
{
  let count = 0;
  const e = makeEffect(() => count++);
  trigger([e]);
  assert.equal(count, 1);
}

// Case 2 — two effects both run when triggered together.
{
  const seen = new Set<string>();
  const a = makeEffect(() => seen.add("a"));
  const b = makeEffect(() => seen.add("b"));
  trigger([a, b]);
  assert.ok(seen.has("a") && seen.has("b"));
}

// Case 3 — nested trigger inside an effect: the newly-scheduled effect
// must have run by the time the outer trigger returns.
{
  const seen = new Set<string>();
  const nested = makeEffect(() => seen.add("nested"));
  const outer = makeEffect(() => {
    seen.add("outer");
    trigger([nested]);
  });
  trigger([outer]);
  assert.ok(seen.has("outer") && seen.has("nested"));
}

// Case 4 — THE bug. isFlushing() reports whether we are inside a
// pending batch flush. When a watcher schedules downstream work via
// trigger(), the nested trigger's effect body must see isFlushing() as
// FALSE — we are no longer inside the outer batch's accounting; the
// outer has logically handed off. Pre-fix (batchDepth-- at bottom of
// endBatch), isFlushing() stays true across the nested call, so
// computed subscribers that guard on `!isFlushing()` never re-schedule.
//
// Observable: inside `nested`, isFlushing() must be false.
{
  let flushingDuringNested: boolean | null = null;
  const nested = makeEffect(() => {
    flushingDuringNested = isFlushing();
  });
  const outer = makeEffect(() => trigger([nested]));
  trigger([outer]);
  assert.equal(
    flushingDuringNested,
    false,
    `isFlushing() inside nested effect should be false (batch should be drained), got ${flushingDuringNested}`
  );
}

console.log("sb36 ok");
