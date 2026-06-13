import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type RunResult = { ok: boolean; stdout: string; stderr: string };

const TIMEOUT_MS = 10_000;

export async function shellcheckFile(content: string): Promise<RunResult> {
  const runDir = await mkdtemp(join(tmpdir(), "sb-shellcheck-"));
  try {
    const filePath = join(runDir, "script.sh");
    await writeFile(filePath, content);

    const result = Bun.spawnSync(["shellcheck", filePath], {
      cwd: runDir,
      stdout: "pipe",
      stderr: "pipe",
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

export async function bashNoExec(content: string): Promise<RunResult> {
  const runDir = await mkdtemp(join(tmpdir(), "sb-bashn-"));
  try {
    const filePath = join(runDir, "script.sh");
    await writeFile(filePath, content);

    const result = Bun.spawnSync(["bash", "-n", filePath], {
      cwd: runDir,
      stdout: "pipe",
      stderr: "pipe",
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
