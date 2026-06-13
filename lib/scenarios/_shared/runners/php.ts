import { mkdtemp, rm, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type RunResult = { ok: boolean; stdout: string; stderr: string };

const TIMEOUT_MS = 10_000;

export async function runPhp(
  entryFile: string,
  files: Record<string, string>,
  wpStubsPath?: string
): Promise<RunResult> {
  const runDir = await mkdtemp(join(tmpdir(), "sb-php-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      const fullPath = join(runDir, path);
      await Bun.write(fullPath, content);
    }

    if (wpStubsPath) {
      const stubsDest = join(runDir, "wp-stubs.php");
      await cp(wpStubsPath, stubsDest);
    }

    const result = Bun.spawnSync(["php", entryFile], {
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

export async function phpLint(content: string): Promise<RunResult> {
  const runDir = await mkdtemp(join(tmpdir(), "sb-phplint-"));
  try {
    const filePath = join(runDir, "check.php");
    await writeFile(filePath, content);

    const result = Bun.spawnSync(["php", "-l", filePath], {
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
