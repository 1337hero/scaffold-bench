import { describe, test, expect } from "bun:test";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rescoreArtifact } from "../scripts/rescore.ts";
import { captureWorkspace } from "../lib/artifacts.ts";
import { PLAYGROUND_SRC } from "../lib/scenarios/_shared/helpers.ts";
import { applyHallucinationPenalty } from "../lib/scoring.ts";
import type { ToolCall } from "../lib/scoring.ts";
import scenario from "../lib/scenarios/SB-01-fix-throttle.ts";

// Reference: the known-good SB-01 gate fixture (real throttle fix, rest untouched).
const GOLD_UTILS = await Bun.file(
  join(import.meta.dir, "scenario-gates", "SB-01", "gold", "utils.js")
).text();

const TOOL_CALLS: ToolCall[] = [
  { name: "read", args: JSON.stringify({ path: "playground/utils.js" }), turn: 0 },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/utils.js", old_str: "", new_str: "" }),
    turn: 1,
  },
];

describe("rescore identity", () => {
  test("rescoreArtifact matches a direct scenario.evaluate() call on the same workspace", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "sb-rescore-test-"));
    try {
      const playgroundDir = join(workDir, "playground");
      await cp(PLAYGROUND_SRC, playgroundDir, { recursive: true });
      await writeFile(join(playgroundDir, "utils.js"), GOLD_UTILS);

      const archive = await captureWorkspace(workDir);

      const directEvaluation = applyHallucinationPenalty(
        await scenario.evaluate!({
          stdout: "",
          playgroundDir: workDir,
          toolCalls: TOOL_CALLS,
          wallTimeMs: 1000,
        }),
        TOOL_CALLS
      );

      const { evaluation: rescored, workDir: reconstructedDir } = await rescoreArtifact("SB-01", {
        version: 1,
        runId: "test-run",
        scenarioId: "SB-01",
        archive,
        toolCalls: TOOL_CALLS,
        stdout: "",
        wallTimeMs: 1000,
      });

      try {
        expect(rescored).toEqual(directEvaluation);
        expect(rescored.points).toBeGreaterThanOrEqual(9);
      } finally {
        await rm(reconstructedDir, { recursive: true, force: true });
      }
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
});
