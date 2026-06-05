import { describe, test, expect } from "bun:test";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { runHiddenTests } from "../../lib/scenarios/_shared/evaluators/index.js";

const fixtures = join(import.meta.dir, "fixtures", "hidden");

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

describe("runHiddenTests", () => {
  test("gold fixture: all hidden tests pass", async () => {
    const dir = join(fixtures, "gold");
    const result = await runHiddenTests("SB-TEST", dir);
    expect(result.total).toBeGreaterThan(0);
    expect(result.passed).toBe(result.total);
    expect(result.rate).toBe(1);
    expect(await exists(join(dir, "__hidden__"))).toBe(false);
  });

  test("broken fixture: some hidden tests fail", async () => {
    const dir = join(fixtures, "broken");
    const result = await runHiddenTests("SB-TEST", dir);
    expect(result.total).toBeGreaterThan(0);
    expect(result.passed).toBeLessThan(result.total);
    expect(result.rate).toBeLessThan(1);
    expect(await exists(join(dir, "__hidden__"))).toBe(false);
  });

  test("no hidden dir → zero-result no-op", async () => {
    const result = await runHiddenTests("SB-NONEXISTENT", join(fixtures, "gold"));
    expect(result).toEqual({ passed: 0, total: 0, rate: 0 });
  });
});
