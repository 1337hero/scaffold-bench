import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type RunResult = { ok: boolean; stdout: string; stderr: string };

const TIMEOUT_MS = 10_000;

export async function goTest(
  dir: string,
  additionalFiles?: Record<string, string>
): Promise<RunResult> {
  const runDir = await mkdtemp(join(tmpdir(), "sb-gotest-"));
  try {
    await cp(dir, runDir, { recursive: true });

    if (additionalFiles) {
      for (const [path, content] of Object.entries(additionalFiles)) {
        await Bun.write(join(runDir, path), content);
      }
    }

    const result = Bun.spawnSync(["go", "test", "./..."], {
      cwd: runDir,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, GOFLAGS: "-count=1" },
      timeout: TIMEOUT_MS,
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
