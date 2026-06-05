import { cp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { ensureNodeModules, runBunTest } from "./vitest.js";

export type HiddenTestResult = { passed: number; total: number; rate: number };

/**
 * Public/hidden test split convention:
 * - Public tests ship inside the model-visible fixture and are listed in
 *   `meta.tests.public`. The model can read and iterate against them.
 * - Hidden tests live OUTSIDE the runtime fixture under
 *   `lib/scenarios/hidden/<scenarioId>/*.test.ts` and are listed in
 *   `meta.tests.hidden`. "Hidden" means hidden from the model's runtime
 *   workdir — not necessarily from repo readers.
 *
 * Hidden tests import the submitted code with a `../` relative path because
 * they run from a temporary `__hidden__/` subdir of the fixture.
 */
const HIDDEN_ROOT = join(import.meta.dir, "..", "..", "hidden");
const STAGE_DIR = "__hidden__";

/** `bun test` prints e.g. " 3 pass" / " 1 fail" in its summary. */
function parseBunCounts(output: string): { passed: number; total: number } {
  const passed = Number(output.match(/^\s*(\d+)\s+pass$/m)?.[1] ?? 0);
  const failed = Number(output.match(/^\s*(\d+)\s+fail$/m)?.[1] ?? 0);
  return { passed, total: passed + failed };
}

/**
 * Copy a scenario's hidden test file(s) into the model's fixture dir, run them
 * with `bun test`, parse per-test pass/total counts, then remove the copied
 * files (cleanup is guaranteed via try/finally).
 *
 * @param scenarioId e.g. "SB-18"
 * @param fixtureDir absolute path to the model's working fixture dir
 */
export async function runHiddenTests(
  scenarioId: string,
  fixtureDir: string
): Promise<HiddenTestResult> {
  const srcDir = join(HIDDEN_ROOT, scenarioId);
  let files: string[];
  try {
    files = (await readdir(srcDir)).filter((f) => /\.(test\.ts|test\.mjs|test\.js)$/.test(f));
  } catch {
    return { passed: 0, total: 0, rate: 0 };
  }
  if (files.length === 0) return { passed: 0, total: 0, rate: 0 };

  const stageDir = join(fixtureDir, STAGE_DIR);
  try {
    await cp(srcDir, stageDir, { recursive: true });
    await ensureNodeModules(fixtureDir);

    let passed = 0;
    let total = 0;
    for (const file of files) {
      const run = await runBunTest(fixtureDir, join(STAGE_DIR, file));
      const counts = parseBunCounts(run.stdout + run.stderr);
      passed += counts.passed;
      total += counts.total;
    }
    return { passed, total, rate: total > 0 ? passed / total : 0 };
  } finally {
    await rm(stageDir, { recursive: true, force: true });
  }
}
