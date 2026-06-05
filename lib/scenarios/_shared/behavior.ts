import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { runBunTest } from "./helpers.js";

/**
 * Run an evaluator-owned behavior test against the model's edited files.
 *
 * Copies each named model file (relative to `playgroundDir`) plus the
 * evaluator-owned `behaviorTestPath` into a throwaway temp dir — flattened to
 * basenames — then runs it with bun. The behavior test must import the model
 * file by basename (e.g. `./currency.ts`) and lives OUTSIDE `playground/`, so
 * the model never sees the assertions and can't hardcode to them.
 */
export async function runBehaviorTest(input: {
  playgroundDir: string;
  files: string[];
  behaviorTestPath: string;
}): Promise<{ pass: boolean; stdout: string; stderr: string }> {
  const runDir = await mkdtemp(join(tmpdir(), "sb-behavior-"));
  try {
    for (const rel of input.files) {
      await cp(join(input.playgroundDir, rel), join(runDir, basename(rel)));
    }
    const testName = basename(input.behaviorTestPath);
    await cp(input.behaviorTestPath, join(runDir, testName));
    const result = await runBunTest(runDir, testName);
    return { pass: result.pass, stdout: result.stdout, stderr: result.stderr };
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}
