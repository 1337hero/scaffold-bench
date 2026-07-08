import { describe, test, expect } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureWorkspace, reconstructWorkspace } from "../lib/artifacts.ts";
import { PLAYGROUND_SRC } from "../lib/scenarios/_shared/helpers.ts";

async function exists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch(() => false);
}

describe("captureWorkspace / reconstructWorkspace roundtrip", () => {
  test("captures edits and deletions, ignores build artifacts, and reconstructs the tree", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "sb-artifacts-test-"));
    try {
      const playgroundDir = join(workDir, "playground");
      await cp(PLAYGROUND_SRC, playgroundDir, { recursive: true });

      // Edit an existing file.
      const editedContent =
        (await readFile(join(playgroundDir, "utils.js"), "utf-8")) + "\n// edited";
      await writeFile(join(playgroundDir, "utils.js"), editedContent);

      // Create a new file.
      await writeFile(join(playgroundDir, "new-file.ts"), "export const x = 1;\n");

      // Delete an existing pristine file.
      await rm(join(playgroundDir, "sb22-loop.js"), { force: true });

      // Add noise that should never be archived.
      await mkdir(join(playgroundDir, "node_modules", "pkg"), { recursive: true });
      await writeFile(
        join(playgroundDir, "node_modules", "pkg", "index.js"),
        "module.exports = {};"
      );
      await writeFile(join(playgroundDir, "bun.lock"), "noise-lockfile");

      const archive = await captureWorkspace(workDir);

      expect(archive.version).toBe(1);
      expect(archive.deleted).toContain("playground/sb22-loop.js");

      const changedUtils = archive.changed.find((f) => f.path === "playground/utils.js");
      expect(changedUtils?.content).toBe(editedContent);

      const newFile = archive.changed.find((f) => f.path === "playground/new-file.ts");
      expect(newFile?.content).toBe("export const x = 1;\n");

      expect(archive.changed.some((f) => f.path.includes("node_modules"))).toBe(false);
      expect(archive.changed.some((f) => f.path.includes("bun.lock"))).toBe(false);

      const reconstructed = await reconstructWorkspace(archive);
      try {
        const reconstructedUtils = await readFile(
          join(reconstructed, "playground", "utils.js"),
          "utf-8"
        );
        expect(reconstructedUtils).toBe(editedContent);

        const reconstructedNewFile = await readFile(
          join(reconstructed, "playground", "new-file.ts"),
          "utf-8"
        );
        expect(reconstructedNewFile).toBe("export const x = 1;\n");

        expect(await exists(join(reconstructed, "playground", "sb22-loop.js"))).toBe(false);
        expect(await exists(join(reconstructed, "playground", "node_modules"))).toBe(false);
      } finally {
        await rm(reconstructed, { recursive: true, force: true });
      }
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
});
