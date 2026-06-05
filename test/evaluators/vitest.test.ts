import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { runVitest, runNodeTest } from "../../lib/scenarios/_shared/evaluators/index.js";

const fixtures = join(import.meta.dir, "fixtures", "vitest");

describe("runVitest", () => {
  test("gold fixture passes", async () => {
    const run = await runVitest(join(fixtures, "gold"), "sum.vt.mjs");
    expect(run.pass).toBe(true);
    expect(run.exitCode).toBe(0);
  });

  test("broken fixture fails", async () => {
    const run = await runVitest(join(fixtures, "broken"), "sum.vt.mjs");
    expect(run.pass).toBe(false);
    expect(run.exitCode).not.toBe(0);
  });
});

describe("runNodeTest", () => {
  test("gold fixture passes", async () => {
    const run = await runNodeTest(join(fixtures, "gold"), "node.nt.mjs");
    expect(run.pass).toBe(true);
    expect(run.stdout).toContain("ok");
  });

  test("broken fixture fails", async () => {
    const run = await runNodeTest(join(fixtures, "broken"), "node.nt.mjs");
    expect(run.pass).toBe(false);
  });
});
