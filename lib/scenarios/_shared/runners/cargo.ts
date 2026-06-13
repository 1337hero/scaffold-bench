import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type RunResult = { ok: boolean; stdout: string; stderr: string };

const RUN_TIMEOUT_MS = 10_000;
// A cold build cache (e.g. a fresh CI runner) can spend longer compiling a crate
// and its dependencies than the run budget allows. Compile under a generous
// budget so RUN_TIMEOUT_MS bounds only the test run — keeping scoring fair
// regardless of how warm the cache is.
const COMPILE_TIMEOUT_MS = 120_000;

export async function cargoCheck(
  dir: string,
  additionalFiles?: Record<string, string>
): Promise<RunResult> {
  const runDir = await mkdtemp(join(tmpdir(), "sb-cargocheck-"));
  try {
    await cp(dir, runDir, { recursive: true });

    if (additionalFiles) {
      for (const [path, content] of Object.entries(additionalFiles)) {
        await Bun.write(join(runDir, path), content);
      }
    }

    // cargo check is pure compilation, so give it the full compile budget.
    const result = Bun.spawnSync(["cargo", "check"], {
      cwd: runDir,
      stdout: "pipe",
      stderr: "pipe",
      timeout: COMPILE_TIMEOUT_MS,
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

export async function cargoTest(
  dir: string,
  additionalFiles?: Record<string, string>,
  runTimeoutMs: number = RUN_TIMEOUT_MS
): Promise<RunResult> {
  const runDir = await mkdtemp(join(tmpdir(), "sb-cargotest-"));
  try {
    await cp(dir, runDir, { recursive: true });

    if (additionalFiles) {
      for (const [path, content] of Object.entries(additionalFiles)) {
        await Bun.write(join(runDir, path), content);
      }
    }

    // Warm the build cache: compile the test binaries without running them.
    Bun.spawnSync(["cargo", "test", "--offline", "--no-run"], {
      cwd: runDir,
      stdout: "ignore",
      stderr: "ignore",
      timeout: COMPILE_TIMEOUT_MS,
    });

    const result = Bun.spawnSync(["cargo", "test", "--offline"], {
      cwd: runDir,
      stdout: "pipe",
      stderr: "pipe",
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
