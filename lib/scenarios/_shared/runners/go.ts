import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type RunResult = { ok: boolean; stdout: string; stderr: string };

const RUN_TIMEOUT_MS = 10_000;
// A cold build cache (e.g. a fresh CI runner) can spend longer compiling the Go
// stdlib than the run budget allows, killing the test before it even starts.
// Compile under a generous budget first so RUN_TIMEOUT_MS bounds only the test
// run — keeping scoring fair regardless of how warm the cache is.
const COMPILE_TIMEOUT_MS = 120_000;

export async function goTest(
  dir: string,
  additionalFiles?: Record<string, string>,
  runTimeoutMs: number = RUN_TIMEOUT_MS
): Promise<RunResult> {
  const runDir = await mkdtemp(join(tmpdir(), "sb-gotest-"));
  try {
    await cp(dir, runDir, { recursive: true });

    if (additionalFiles) {
      for (const [path, content] of Object.entries(additionalFiles)) {
        await Bun.write(join(runDir, path), content);
      }
    }

    const env = { ...process.env, GOFLAGS: "-count=1" };

    // Warm the build cache: compile every test binary without running any test.
    Bun.spawnSync(["go", "test", "-run=^$", "./..."], {
      cwd: runDir,
      stdout: "ignore",
      stderr: "ignore",
      env,
      timeout: COMPILE_TIMEOUT_MS,
    });

    const result = Bun.spawnSync(["go", "test", "./..."], {
      cwd: runDir,
      stdout: "pipe",
      stderr: "pipe",
      env,
      timeout: runTimeoutMs,
    });

    return {
      ok: result.exitCode === 0,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}
