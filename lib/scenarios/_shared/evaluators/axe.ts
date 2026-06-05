import { ensureNodeModules } from "./vitest.js";
import { browsersMissing, playwrightAvailable, type SkippedResult } from "./playwright.js";

export type { SkippedResult };

export type AxeRun =
  | SkippedResult
  | { skipped: false; pass: boolean; exitCode: number | null; stdout: string; stderr: string };

export function axeAvailable(): boolean {
  if (!playwrightAvailable()) return false;
  try {
    require.resolve("@axe-core/playwright");
    require.resolve("axe-core");
  } catch {
    return false;
  }
  return true;
}

/**
 * Runs an @axe-core/playwright accessibility spec. The spec drives a page
 * (its own URL/target) and asserts on `AxeBuilder` violations. Gated behind
 * `axeAvailable()`; returns a structured skipped result when deps or
 * browsers are absent, never throws.
 */
export async function runAxe(fixtureDir: string, specFile: string): Promise<AxeRun> {
  if (!axeAvailable()) {
    return { skipped: true, reason: "axe-core-or-playwright-unavailable" };
  }
  await ensureNodeModules(fixtureDir);
  const result = Bun.spawnSync(["bun", "x", "playwright", "test", specFile], {
    cwd: fixtureDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  if (browsersMissing(stdout + stderr)) {
    return { skipped: true, reason: "playwright-browsers-not-installed" };
  }
  return {
    skipped: false,
    pass: result.exitCode === 0,
    exitCode: result.exitCode,
    stdout,
    stderr,
  };
}
