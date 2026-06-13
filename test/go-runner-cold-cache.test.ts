import { describe, it, expect } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTest } from "../lib/scenarios/_shared/runners/go.ts";
import { hasTool } from "../lib/scenarios/_shared/toolchain.js";

const here = import.meta.dir;
const BASE = join(here, "..", "playground", "go-api");
const GOLD_HANDLERS = join(here, "scenario-gates", "SB-47", "gold", "go-api", "handlers.go");

// Regression for the SB-47 CI failure: on a cold build cache (a fresh CI runner)
// compiling the Go stdlib alone outran the 10s run budget, so a valid solution's
// `go test` was killed mid-compile and scored as a failure. goTest must compile
// under a separate, generous budget so the run timeout bounds only the test run.
describe("goTest cold build cache", () => {
  it.skipIf(!hasTool("go"))(
    "valid solution passes even with a run timeout shorter than a cold compile",
    async () => {
      const mod = await mkdtemp(join(tmpdir(), "sb-go-cold-"));
      const coldCache = await mkdtemp(join(tmpdir(), "sb-go-cache-"));
      const prevCache = process.env.GOCACHE;
      try {
        await cp(BASE, mod, { recursive: true });
        await cp(GOLD_HANDLERS, join(mod, "handlers.go"));
        process.env.GOCACHE = coldCache; // force a cold compile

        // 2.5s is well under a cold stdlib compile but far above a warm test run;
        // it only passes because goTest compiles before it starts the timer.
        const result = await goTest(mod, undefined, 2_500);
        expect(result.ok).toBe(true);
      } finally {
        if (prevCache === undefined) delete process.env.GOCACHE;
        else process.env.GOCACHE = prevCache;
        await rm(mod, { recursive: true, force: true });
        await rm(coldCache, { recursive: true, force: true });
      }
    },
    60_000
  );
});
