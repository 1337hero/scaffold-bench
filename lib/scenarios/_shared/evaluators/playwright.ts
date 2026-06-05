import { ensureNodeModules } from "./vitest.js";

export type SkippedResult = { skipped: true; reason: string };

export type BrowserRun =
  | SkippedResult
  | { skipped: false; pass: boolean; exitCode: number | null; stdout: string; stderr: string };

export function isSkipped(run: BrowserRun): run is SkippedResult {
  return run.skipped;
}

export function browsersMissing(output: string): boolean {
  return /Executable doesn't exist|browserType\.launch|playwright install/i.test(output);
}

export function playwrightAvailable(): boolean {
  try {
    require.resolve("@playwright/test");
  } catch {
    return false;
  }
  const result = Bun.spawnSync(["bun", "x", "playwright", "--version"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return result.exitCode === 0;
}

export async function runPlaywright(fixtureDir: string, specFile: string): Promise<BrowserRun> {
  if (!playwrightAvailable()) {
    return { skipped: true, reason: "@playwright/test-unavailable" };
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
