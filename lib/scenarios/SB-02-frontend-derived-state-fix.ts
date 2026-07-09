import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { extractFunction } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  firstChangeTurn,
  firstTurn,
  noAddedComments,
  noConsoleLog,
  onlyChangedFiles,
  stripComments,
} from "./_shared/helpers.js";
import { fileCalls } from "./_shared/evaluators/ast.js";

export const meta = {
  id: "SB-02",
  name: "frontend-derived-state-fix",
  category: "surgical-edit" as const,
  family: "regex-style" as const,
  difficulty: "medium" as const, // cognitive-load override (field mean inflated by strong-model sample)
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  evaluatorKind: "ast" as const,
  fixturePath: "playground/frontend/",
  prompt: `Fix the derived-state issue in playground/frontend/InventoryPanel.tsx. Keep the component shape and existing stack. Fix that issue only.`,
} as const;

const scenario: Scenario = {
  id: "SB-02" as ScenarioId,
  name: "frontend-derived-state-fix",
  category: "surgical-edit",
  family: "regex-style",
  difficulty: "medium",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const filePath = join(playgroundDir, "playground/frontend/InventoryPanel.tsx");
    const current = await readFile(filePath, "utf-8");
    const original = await readFile(join(PLAYGROUND_SRC, "frontend/InventoryPanel.tsx"), "utf-8");
    const currentCode = stripComments(current);
    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);
    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/frontend/InventoryPanel.tsx"],
    });

    // AST: a single source of truth. No sync effect and no derived-state setter
    // (so no duplicate `filteredItems` state to keep in sync), with the filtered
    // list computed directly from `items`.
    const noSyncEffect = !fileCalls(filePath, "useEffect");
    const noDerivedSetter = !fileCalls(filePath, "setFilteredItems");
    const computesInline = fileCalls(filePath, "filter");

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "derived list has a single source of truth: no sync effect, no setter, computed inline (AST)",
            pass: noSyncEffect && noDerivedSetter && computesInline,
            weight: 3,
          },
        ],
        scope: [
          {
            name: "edited only InventoryPanel.tsx",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "did not add useMemo for simple derived data",
            pass: !/useMemo\s*\(/.test(currentCode),
            weight: 1,
          },
          {
            name: "formatCount helper left untouched",
            pass:
              extractFunction(current, "formatCount") !== "" &&
              extractFunction(current, "formatCount") === extractFunction(original, "formatCount"),
            weight: 1,
          },
        ],
        verification: [
          {
            name: "read file before changing it (turn-ordered)",
            pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
            weight: 1,
          },
        ],
        cleanup: [
          { name: "no added comments", pass: noAddedComments(current, original), weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(current), weight: 1 },
        ],
      },
      {
        pass: "Removed duplicated derived state without drifting from the existing component.",
        partial: "Fixed the derived-state issue, but added unnecessary changes or abstractions.",
        fail: "Did not remove the derived-state sync cleanly.",
      }
    );
  },
};

export default scenario;
