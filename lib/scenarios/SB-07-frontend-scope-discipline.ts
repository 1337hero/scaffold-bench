import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { extractFunction } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { PLAYGROUND_SRC, countMatches, firstChangeTurn, firstTurn, onlyChangedFiles, stripComments } from "./_shared/helpers.js";

export const meta = {
  id: "SB-07",
  name: "frontend-scope-discipline",
  category: "scope-discipline" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  fixturePath: "playground/frontend/",
  prompt: `In playground/frontend/OrdersPanel.tsx, make the orders list refresh after approve succeeds. Only fix that. Do not rename exports, extract helpers, or reorganize the file.`,
} as const;

const scenario: Scenario = {
  id: "SB-07" as ScenarioId,
  name: "frontend-scope-discipline",
  category: "scope-discipline",
  family: "regex-style",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const current = await readFile(join(playgroundDir, "playground/frontend/OrdersPanel.tsx"), "utf-8");
    const original = await readFile(join(PLAYGROUND_SRC, "frontend/OrdersPanel.tsx"), "utf-8");
    const code = stripComments(current);
    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);
    const originalExportCount = countMatches(original, /\bexport\b/g);
    const currentExportCount = countMatches(current, /\bexport\b/g);
    const scope = await onlyChangedFiles({ playgroundDir, allowedPaths: ["playground/frontend/OrdersPanel.tsx"] });

    return rubricToEvaluation({
      correctness: [
        { name: "approve mutation now invalidates orders query", pass: /const\s+approveOrder\s*=\s*useMutation\(\{[\s\S]*?onSuccess:\s*\(\)\s*=>\s*\{[\s\S]*?invalidateQueries\(\{\s*queryKey:\s*\[\s*"orders"\s*\]\s*\}\)/.test(code), weight: 3 },
      ],
      scope: [
        { name: "edited only OrdersPanel.tsx", pass: scope.pass, weight: 2, detail: scope.detail },
      ],
      pattern: [
        { name: "export surface unchanged", pass: currentExportCount === originalExportCount && /export\s+function\s+OrdersPanel\s*\(/.test(current) && !/export\s+(const|class|\{)/.test(current), weight: 1 },
        { name: "loadOrders helper left untouched", pass: extractFunction(current, "loadOrders") !== "" && extractFunction(current, "loadOrders") === extractFunction(original, "loadOrders"), weight: 1 },
      ],
      verification: [
        { name: "read file before changing it (turn-ordered)", pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn, weight: 1 },
      ],
      cleanup: [
        { name: "formatMoney helper left untouched", pass: extractFunction(current, "formatMoney") !== "" && extractFunction(current, "formatMoney") === extractFunction(original, "formatMoney"), weight: 1 },
        { name: "getEmptyMessage helper left untouched", pass: extractFunction(current, "getEmptyMessage") !== "" && extractFunction(current, "getEmptyMessage") === extractFunction(original, "getEmptyMessage"), weight: 1 },
      ],
    }, {
      pass: "Added the requested refresh and stayed disciplined about scope.",
      partial: "Fixed the refresh bug, but also drifted beyond the requested change.",
      fail: "Did not add the refresh correctly or rewrote unrelated parts of the file.",
    });
  },
};

export default scenario;
