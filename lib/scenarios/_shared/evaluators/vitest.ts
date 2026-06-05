import { stat, symlink } from "node:fs/promises";
import { join } from "node:path";

const PLAYGROUND_SRC = join(import.meta.dir, "..", "..", "..", "..", "playground");

export type TestRun = {
  pass: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export async function ensureNodeModules(fixtureDir: string): Promise<void> {
  const nmPath = join(fixtureDir, "node_modules");
  try {
    await stat(nmPath);
  } catch {
    await symlink(join(PLAYGROUND_SRC, "..", "node_modules"), nmPath);
  }
}

function spawn(command: string[], cwd: string): TestRun {
  const result = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" });
  return {
    pass: result.exitCode === 0,
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

export async function runBunTest(fixtureDir: string, testFile: string): Promise<TestRun> {
  await ensureNodeModules(fixtureDir);
  return spawn(["bun", "test", testFile], fixtureDir);
}

export async function runVitest(fixtureDir: string, testGlob: string): Promise<TestRun> {
  await ensureNodeModules(fixtureDir);
  return spawn(["bun", "x", "vitest", "run", testGlob], fixtureDir);
}

export async function runNodeTest(fixtureDir: string, testFile: string): Promise<TestRun> {
  await ensureNodeModules(fixtureDir);
  return spawn(["node", testFile], fixtureDir);
}
