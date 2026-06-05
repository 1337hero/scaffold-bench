import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import {
  runPlaywright,
  playwrightAvailable,
  isSkipped,
} from "../../lib/scenarios/_shared/evaluators/index.js";

const fixtures = join(import.meta.dir, "fixtures", "playwright");

describe("runPlaywright", () => {
  test("gold spec passes (or skips structurally when browsers absent)", async () => {
    const run = await runPlaywright(join(fixtures, "gold"), "title.pw.mjs");
    if (isSkipped(run)) {
      expect(run.skipped).toBe(true);
      expect(typeof run.reason).toBe("string");
      return;
    }
    expect(run.pass).toBe(true);
  });

  test("broken spec fails (or skips structurally when browsers absent)", async () => {
    const run = await runPlaywright(join(fixtures, "broken"), "title.pw.mjs");
    if (isSkipped(run)) {
      expect(run.skipped).toBe(true);
      return;
    }
    expect(run.pass).toBe(false);
  });

  test("availability check returns a boolean and never throws", () => {
    expect(typeof playwrightAvailable()).toBe("boolean");
  });
});
