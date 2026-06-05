import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { runAxe, axeAvailable } from "../../lib/scenarios/_shared/evaluators/index.js";

const fixtures = join(import.meta.dir, "fixtures", "axe");

describe("runAxe", () => {
  test("gold page has no violations (or skips structurally when browsers absent)", async () => {
    const run = await runAxe(join(fixtures, "gold"), "a11y.pw.mjs");
    if (run.skipped) {
      expect(run.skipped).toBe(true);
      expect(typeof run.reason).toBe("string");
      return;
    }
    expect(run.pass).toBe(true);
  });

  test("broken page reports violations (or skips structurally when browsers absent)", async () => {
    const run = await runAxe(join(fixtures, "broken"), "a11y.pw.mjs");
    if (run.skipped) {
      expect(run.skipped).toBe(true);
      return;
    }
    expect(run.pass).toBe(false);
  });

  test("availability check returns a boolean and never throws", () => {
    expect(typeof axeAvailable()).toBe("boolean");
  });
});
