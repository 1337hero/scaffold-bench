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

export const meta = {
  id: "SB-05",
  name: "frontend-derived-state-fix",
  category: "surgical-edit" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  fixturePath: "playground/frontend/",
  prompt: `Fix the derived-state issue in playground/frontend/InventoryPanel.tsx. Keep the component shape and existing stack. Fix that issue only.`,
} as const;

const scenario: Scenario = {
  id: "SB-05" as ScenarioId,
  name: "frontend-derived-state-fix",
  category: "surgical-edit",
  family: "regex-style",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const current = await readFile(join(playgroundDir, "playground/frontend/InventoryPanel.tsx"), "utf-8");
    const original = await readFile(join(PLAYGROUND_SRC, "frontend/InventoryPanel.tsx"), "utf-8");
    const currentCode = stripComments(current);
    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);
    const scope = await onlyChangedFiles({ playgroundDir, allowedPaths: ["playground/frontend/InventoryPanel.tsx"] });

    return rubricToEvaluation({
      correctness: [
        { name: "removed duplicated filteredItems state", pass: !/const\s*\[\s*filteredItems\s*,\s*setFilteredItems\s*\]/.test(currentCode), weight: 1 },
        { name: "removed sync effect for filteredItems", pass: !/setFilteredItems\s*\(/.test(currentCode) && !/useEffect\s*\(/.test(currentCode), weight: 1 },
        { name: "computes filtered data from items inline", pass: /items\s*\.\s*filter\s*\(/.test(currentCode), weight: 1 },
      ],
      scope: [
        { name: "edited only InventoryPanel.tsx", pass: scope.pass, weight: 2, detail: scope.detail },
      ],
      pattern: [
        { name: "did not add useMemo for simple derived data", pass: !/useMemo\s*\(/.test(currentCode), weight: 1 },
        { name: "formatCount helper left untouched", pass: extractFunction(current, "formatCount") !== "" && extractFunction(current, "formatCount") === extractFunction(original, "formatCount"), weight: 1 },
      ],
      verification: [
        { name: "read file before changing it (turn-ordered)", pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn, weight: 1 },
      ],
      cleanup: [
        { name: "no added comments", pass: noAddedComments(current, original), weight: 1 },
        { name: "no console.log added", pass: noConsoleLog(current), weight: 1 },
      ],
    }, {
      pass: "Removed duplicated derived state without drifting from the existing component.",
      partial: "Fixed the derived-state issue, but added unnecessary changes or abstractions.",
      fail: "Did not remove the derived-state sync cleanly.",
    });
  },
};

export default scenario;
