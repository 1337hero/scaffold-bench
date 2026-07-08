import { describe, test, expect } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  changedFilesSincePristine,
  extractReportedLineRange,
  onlyChangedFiles,
  noFilesChanged,
} from "../lib/scenarios/_shared/helpers.ts";

async function makeTempDir(): Promise<string> {
  const dir = join(tmpdir(), `sb-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

describe("changedFilesSincePristine", () => {
  test("no changes returns empty array", async () => {
    const base = await makeTempDir();
    const pristine = join(base, "pristine");
    const current = join(base, "current", "playground");
    await mkdir(join(pristine, "src"), { recursive: true });
    await mkdir(join(current, "src"), { recursive: true });
    await writeFile(join(pristine, "src", "a.ts"), "hello");
    await writeFile(join(current, "src", "a.ts"), "hello");

    const result = await changedFilesSincePristine({
      playgroundDir: join(base, "current"),
      pristineDir: pristine,
    });
    expect(result).toEqual([]);

    await rm(base, { recursive: true, force: true });
  });

  test("modified file detected", async () => {
    const base = await makeTempDir();
    const pristine = join(base, "pristine");
    const current = join(base, "current", "playground");
    await mkdir(pristine, { recursive: true });
    await mkdir(current, { recursive: true });
    await writeFile(join(pristine, "a.ts"), "hello");
    await writeFile(join(current, "a.ts"), "world");

    const result = await changedFilesSincePristine({
      playgroundDir: join(base, "current"),
      pristineDir: pristine,
    });
    expect(result).toEqual(["playground/a.ts"]);

    await rm(base, { recursive: true, force: true });
  });

  test("created file detected", async () => {
    const base = await makeTempDir();
    const pristine = join(base, "pristine");
    const current = join(base, "current", "playground");
    await mkdir(pristine, { recursive: true });
    await mkdir(current, { recursive: true });
    await writeFile(join(current, "new.ts"), "new");

    const result = await changedFilesSincePristine({
      playgroundDir: join(base, "current"),
      pristineDir: pristine,
    });
    expect(result).toEqual(["playground/new.ts"]);

    await rm(base, { recursive: true, force: true });
  });

  test("deleted file detected", async () => {
    const base = await makeTempDir();
    const pristine = join(base, "pristine");
    const current = join(base, "current", "playground");
    await mkdir(pristine, { recursive: true });
    await mkdir(current, { recursive: true });
    await writeFile(join(pristine, "gone.ts"), "bye");

    const result = await changedFilesSincePristine({
      playgroundDir: join(base, "current"),
      pristineDir: pristine,
    });
    expect(result).toEqual(["playground/gone.ts"]);

    await rm(base, { recursive: true, force: true });
  });

  test("nested paths normalize with playground/ prefix", async () => {
    const base = await makeTempDir();
    const pristine = join(base, "pristine");
    const current = join(base, "current", "playground");
    await mkdir(join(pristine, "deep", "dir"), { recursive: true });
    await mkdir(join(current, "deep", "dir"), { recursive: true });
    await writeFile(join(pristine, "deep", "dir", "file.ts"), "a");
    await writeFile(join(current, "deep", "dir", "file.ts"), "b");

    const result = await changedFilesSincePristine({
      playgroundDir: join(base, "current"),
      pristineDir: pristine,
    });
    expect(result).toEqual(["playground/deep/dir/file.ts"]);

    await rm(base, { recursive: true, force: true });
  });

  test("directories are ignored", async () => {
    const base = await makeTempDir();
    const pristine = join(base, "pristine");
    const current = join(base, "current", "playground");
    await mkdir(join(pristine, "emptydir"), { recursive: true });
    await mkdir(join(current, "emptydir"), { recursive: true });

    const result = await changedFilesSincePristine({
      playgroundDir: join(base, "current"),
      pristineDir: pristine,
    });
    expect(result).toEqual([]);

    await rm(base, { recursive: true, force: true });
  });
});

describe("onlyChangedFiles", () => {
  test("passes when only allowed files changed", async () => {
    const base = await makeTempDir();
    const pristine = join(base, "pristine");
    const current = join(base, "current", "playground");
    await mkdir(pristine, { recursive: true });
    await mkdir(current, { recursive: true });
    await writeFile(join(pristine, "a.ts"), "hello");
    await writeFile(join(current, "a.ts"), "world");

    const result = await onlyChangedFiles({
      playgroundDir: join(base, "current"),
      pristineDir: pristine,
      allowedPaths: ["playground/a.ts"],
    });
    expect(result.pass).toBe(true);
    expect(result.changed).toEqual(["playground/a.ts"]);

    await rm(base, { recursive: true, force: true });
  });

  test("fails when an extra file changed", async () => {
    const base = await makeTempDir();
    const pristine = join(base, "pristine");
    const current = join(base, "current", "playground");
    await mkdir(pristine, { recursive: true });
    await mkdir(current, { recursive: true });
    await writeFile(join(pristine, "a.ts"), "hello");
    await writeFile(join(current, "a.ts"), "world");
    await writeFile(join(current, "b.ts"), "extra");

    const result = await onlyChangedFiles({
      playgroundDir: join(base, "current"),
      pristineDir: pristine,
      allowedPaths: ["playground/a.ts"],
    });
    expect(result.pass).toBe(false);
    expect(result.changed).toContain("playground/a.ts");
    expect(result.changed).toContain("playground/b.ts");

    await rm(base, { recursive: true, force: true });
  });

  test("fails when nothing changed", async () => {
    const base = await makeTempDir();
    const pristine = join(base, "pristine");
    const current = join(base, "current", "playground");
    await mkdir(pristine, { recursive: true });
    await mkdir(current, { recursive: true });
    await writeFile(join(pristine, "a.ts"), "hello");
    await writeFile(join(current, "a.ts"), "hello");

    const result = await onlyChangedFiles({
      playgroundDir: join(base, "current"),
      pristineDir: pristine,
      allowedPaths: ["playground/a.ts"],
    });
    expect(result.pass).toBe(false);
    expect(result.changed).toEqual([]);
    expect(result.detail).toContain("no files changed");

    await rm(base, { recursive: true, force: true });
  });
});

describe("onlyChangedFiles ignores build artifacts", () => {
  test("passes when only the allowed file changed alongside build artifacts", async () => {
    const base = await makeTempDir();
    const pristine = join(base, "pristine");
    const current = join(base, "current", "playground");
    await mkdir(join(pristine, "src"), { recursive: true });
    await mkdir(join(current, "src"), { recursive: true });
    await writeFile(join(pristine, "src", "lib.rs"), "fn main() {}");
    await writeFile(join(pristine, "Cargo.lock"), "orig-lock");
    await writeFile(join(current, "src", "lib.rs"), "fn main() { println!(); }");
    await writeFile(join(current, "Cargo.lock"), "new-lock");
    await mkdir(join(current, "target", "debug"), { recursive: true });
    await writeFile(join(current, "target", "debug", "fingerprint"), "artifact");
    await mkdir(join(current, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(current, "node_modules", "pkg", "index.js"), "module");
    await writeFile(join(current, "bun.lock"), "bun-lockfile");

    const result = await onlyChangedFiles({
      playgroundDir: join(base, "current"),
      pristineDir: pristine,
      allowedPaths: ["playground/src/lib.rs"],
    });
    expect(result.pass).toBe(true);
    expect(result.changed).toEqual(["playground/src/lib.rs"]);

    await rm(base, { recursive: true, force: true });
  });

  test("still fails when a file outside allowedPaths changed", async () => {
    const base = await makeTempDir();
    const pristine = join(base, "pristine");
    const current = join(base, "current", "playground");
    await mkdir(join(pristine, "src"), { recursive: true });
    await mkdir(join(current, "src"), { recursive: true });
    await writeFile(join(pristine, "src", "lib.rs"), "fn main() {}");
    await writeFile(join(pristine, "src", "extra.rs"), "fn extra() {}");
    await writeFile(join(current, "src", "lib.rs"), "fn main() { println!(); }");
    await writeFile(join(current, "src", "extra.rs"), "fn extra() { println!(); }");
    await mkdir(join(current, "node_modules"), { recursive: true });
    await writeFile(join(current, "node_modules", "pkg.js"), "module");

    const result = await onlyChangedFiles({
      playgroundDir: join(base, "current"),
      pristineDir: pristine,
      allowedPaths: ["playground/src/lib.rs"],
    });
    expect(result.pass).toBe(false);
    expect(result.changed).toEqual(["playground/src/extra.rs", "playground/src/lib.rs"]);

    await rm(base, { recursive: true, force: true });
  });
});

describe("noFilesChanged", () => {
  test("passes when nothing changed", async () => {
    const base = await makeTempDir();
    const pristine = join(base, "pristine");
    const current = join(base, "current", "playground");
    await mkdir(pristine, { recursive: true });
    await mkdir(current, { recursive: true });
    await writeFile(join(pristine, "a.ts"), "hello");
    await writeFile(join(current, "a.ts"), "hello");

    const result = await noFilesChanged({
      playgroundDir: join(base, "current"),
      pristineDir: pristine,
    });
    expect(result.pass).toBe(true);
    expect(result.changed).toEqual([]);

    await rm(base, { recursive: true, force: true });
  });

  test("fails when a file was modified", async () => {
    const base = await makeTempDir();
    const pristine = join(base, "pristine");
    const current = join(base, "current", "playground");
    await mkdir(pristine, { recursive: true });
    await mkdir(current, { recursive: true });
    await writeFile(join(pristine, "a.ts"), "hello");
    await writeFile(join(current, "a.ts"), "world");

    const result = await noFilesChanged({
      playgroundDir: join(base, "current"),
      pristineDir: pristine,
    });
    expect(result.pass).toBe(false);
    expect(result.changed).toEqual(["playground/a.ts"]);

    await rm(base, { recursive: true, force: true });
  });
});

describe("extractReportedLineRange", () => {
  test("requires a separator between line numbers", () => {
    expect(extractReportedLineRange("line 120 145")).toBeNull();
    expect(extractReportedLineRange("line 120-145")).toEqual({ start: 120, end: 145 });
  });
});
