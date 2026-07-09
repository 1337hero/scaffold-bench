import { describe, expect, test } from "bun:test";
import {
  VERIFY_COMMAND_PATTERN,
  deriveVerifyMetrics,
  type ToolCall,
} from "../lib/scoring.ts";
import type { WorkspaceArchive } from "../lib/artifacts.ts";
import { ok, err } from "../lib/schemas/tool-result.ts";

function bash(command: string, exitCode: number | null, turn = 0): ToolCall {
  return {
    name: "bash",
    args: JSON.stringify({ command }),
    turn,
    result:
      exitCode === null
        ? undefined
        : ok(`exit_code: ${exitCode}\n\nstdout:\n`),
  };
}

function edit(okResult = true, turn = 1): ToolCall {
  return {
    name: "edit",
    args: JSON.stringify({ path: "playground/x.ts", old_str: "a", new_str: "b" }),
    turn,
    result: okResult ? ok("ok") : err("failed"),
  };
}

function write(okResult = true, turn = 1): ToolCall {
  return {
    name: "write",
    args: JSON.stringify({ path: "playground/x.ts", content: "hi" }),
    turn,
    result: okResult ? ok("ok") : err("failed"),
  };
}

function archive(
  changed: string[] = [],
  deleted: string[] = []
): WorkspaceArchive {
  return {
    version: 1,
    changed: changed.map((path) => ({ path, content: "" })),
    deleted,
  };
}

describe("VERIFY_COMMAND_PATTERN", () => {
  const positive = [
    "bun test",
    "bun test playground/foo.test.ts",
    "npm test",
    "npm run test",
    "node --test",
    "npx vitest run",
    "vitest",
    "jest",
    "npx jest",
    "pytest",
    "python -m pytest tests/",
    "cargo test",
    "cargo check",
    "go test ./...",
    "go vet ./...",
    "go build ./cmd/app",
    "php -l index.php",
    "shellcheck deploy.sh",
    "tsc --noEmit",
    "npx tsc -p .",
    "cd playground && bun test",
    "make test",
    "run the specs again",
  ];

  const negative = [
    "ls",
    "ls -la",
    "cat file.ts",
    "grep -r foo .",
    "echo hello",
    "pwd",
    "sed -i 's/a/b/' file.ts",
    "git status",
    "mkdir -p dist",
    "rm -rf node_modules",
    "curl http://localhost",
    "which node",
  ];

  test("matches verification commands", () => {
    for (const cmd of positive) {
      expect(VERIFY_COMMAND_PATTERN.test(cmd), `expected match: ${cmd}`).toBe(true);
    }
  });

  test("rejects non-verification commands", () => {
    for (const cmd of negative) {
      expect(VERIFY_COMMAND_PATTERN.test(cmd), `expected no match: ${cmd}`).toBe(false);
    }
  });

  test("is case-insensitive", () => {
    expect(VERIFY_COMMAND_PATTERN.test("BUN TEST")).toBe(true);
    expect(VERIFY_COMMAND_PATTERN.test("Cargo Test")).toBe(true);
  });
});

describe("deriveVerifyMetrics", () => {
  test("no-bash run with edit: mutated, zero bash counts", () => {
    const m = deriveVerifyMetrics([edit()], archive(["playground/x.ts"]));
    expect(m).toEqual({
      bash_calls: 0,
      post_change_bash_calls: 0,
      verify_passes: 0,
      mutated: 1,
    });
  });

  test("verification before any edit is not counted", () => {
    const m = deriveVerifyMetrics(
      [bash("bun test", 0, 0), edit(true, 1), bash("ls", 0, 2)],
      archive(["playground/x.ts"])
    );
    expect(m.mutated).toBe(1);
    expect(m.bash_calls).toBe(2);
    expect(m.post_change_bash_calls).toBe(1); // only the ls after edit
    expect(m.verify_passes).toBe(0);
  });

  test("sed-via-bash mutation: all bash counts as post-change", () => {
    const m = deriveVerifyMetrics(
      [
        bash("sed -i 's/a/b/' playground/x.ts", 0, 0),
        bash("bun test", 0, 1),
      ],
      archive(["playground/x.ts"])
    );
    expect(m.mutated).toBe(1);
    expect(m.bash_calls).toBe(2);
    expect(m.post_change_bash_calls).toBe(2);
    expect(m.verify_passes).toBe(1);
  });

  test("ls after edit with exit 0 is not a verification", () => {
    const m = deriveVerifyMetrics(
      [edit(true, 0), bash("ls", 0, 1)],
      archive(["playground/x.ts"])
    );
    expect(m.verify_passes).toBe(0);
    expect(m.post_change_bash_calls).toBe(1);
  });

  test("bun test after edit with exit_code 1 is not a pass", () => {
    const m = deriveVerifyMetrics(
      [edit(true, 0), bash("bun test", 1, 1)],
      archive(["playground/x.ts"])
    );
    expect(m.verify_passes).toBe(0);
    expect(m.post_change_bash_calls).toBe(1);
  });

  test("bun test after edit with exit_code 0 is a pass", () => {
    const m = deriveVerifyMetrics(
      [edit(true, 0), bash("bun test", 0, 1)],
      archive(["playground/x.ts"])
    );
    expect(m.verify_passes).toBe(1);
    expect(m.mutated).toBe(1);
  });

  test("read-only run: mutated=0, excluded from rate by caller", () => {
    const m = deriveVerifyMetrics(
      [
        { name: "read", args: JSON.stringify({ path: "playground/x.ts" }), turn: 0, result: ok("...") },
        bash("ls", 0, 1),
      ],
      archive()
    );
    expect(m.mutated).toBe(0);
    expect(m.bash_calls).toBe(1);
    expect(m.post_change_bash_calls).toBe(0);
    expect(m.verify_passes).toBe(0);
  });

  test("failed edit then successful write sets mutation at write index", () => {
    const m = deriveVerifyMetrics(
      [
        bash("bun test", 0, 0),
        edit(false, 1),
        write(true, 2),
        bash("bun test", 0, 3),
      ],
      archive(["playground/x.ts"])
    );
    expect(m.mutated).toBe(1);
    expect(m.bash_calls).toBe(2);
    expect(m.post_change_bash_calls).toBe(1);
    expect(m.verify_passes).toBe(1);
  });

  test("archive-only mutation without edit/write tool calls", () => {
    const m = deriveVerifyMetrics([bash("pytest", 0, 0)], archive([], ["playground/old.ts"]));
    expect(m.mutated).toBe(1);
    expect(m.verify_passes).toBe(1);
  });
});
