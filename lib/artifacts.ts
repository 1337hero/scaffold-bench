import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PLAYGROUND_SRC, walkFiles } from "./scenarios/_shared/helpers.ts";

export type WorkspaceArchive = {
  version: 1;
  changed: Array<{ path: string; content: string }>;
  deleted: string[];
};

export async function captureWorkspace(workDir: string): Promise<WorkspaceArchive> {
  const pristineDir = PLAYGROUND_SRC;
  const currentDir = join(workDir, "playground");

  const pristineFiles = new Set<string>();
  try {
    for await (const rel of walkFiles(pristineDir, pristineDir)) pristineFiles.add(rel);
  } catch {
    /* ignore missing pristine dir */
  }

  const currentFiles = new Set<string>();
  try {
    for await (const rel of walkFiles(currentDir, currentDir)) currentFiles.add(rel);
  } catch {
    /* ignore missing current dir */
  }

  const changed: Array<{ path: string; content: string }> = [];
  for (const rel of currentFiles) {
    // ponytail: fixtures are text; a file that fails utf-8 decode is skipped rather than archived.
    const content = await readFile(join(currentDir, rel), "utf-8").catch(() => null);
    if (content === null) continue;

    if (!pristineFiles.has(rel)) {
      changed.push({ path: `playground/${rel}`, content });
      continue;
    }

    const pristineContent = await readFile(join(pristineDir, rel), "utf-8").catch(() => null);
    if (pristineContent !== content) {
      changed.push({ path: `playground/${rel}`, content });
    }
  }

  const deleted = [...pristineFiles]
    .filter((rel) => !currentFiles.has(rel))
    .map((rel) => `playground/${rel}`);

  return { version: 1, changed, deleted: deleted.toSorted() };
}

export async function reconstructWorkspace(archive: WorkspaceArchive): Promise<string> {
  const workDir = await mkdtemp(join(tmpdir(), "scaffold-bench-rescore-"));
  await cp(PLAYGROUND_SRC, join(workDir, "playground"), { recursive: true });

  for (const path of archive.deleted) {
    await rm(join(workDir, path), { force: true });
  }
  for (const file of archive.changed) {
    const full = join(workDir, file.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, file.content);
  }

  return workDir;
}
