import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { extractFunction } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  bunAvailable,
  countMatches,
  firstChangeTurn,
  firstTurn,
  onlyChangedFiles,
} from "./_shared/helpers.js";
import { runBunTest, runHiddenTests } from "./_shared/evaluators/index.js";

const FRONTEND = "playground/frontend";

const loadOrdersBlock = (src: string) =>
  src.match(/async function loadOrders[\s\S]*?\n}/)?.[0] ?? "";

export const meta = {
  id: "SB-04",
  name: "frontend-scope-discipline",
  category: "scope-discipline" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/frontend/",
  prompt: `In playground/frontend/OrdersPanel.tsx, make the orders list refresh after approve succeeds. Only fix that. Do not rename exports, extract helpers, or reorganize the file.`,
} as const;

const scenario: Scenario = {
  id: "SB-04" as ScenarioId,
  name: "frontend-scope-discipline",
  category: "scope-discipline",
  family: "regex-style",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, FRONTEND);
    const current = await readFile(join(fixtureDir, "OrdersPanel.tsx"), "utf-8");
    const original = await readFile(join(PLAYGROUND_SRC, "frontend/OrdersPanel.tsx"), "utf-8");
    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);
    const originalExportCount = countMatches(original, /\bexport\b/g);
    const currentExportCount = countMatches(current, /\bexport\b/g);
    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [`${FRONTEND}/OrdersPanel.tsx`],
    });

    const loadOrdersUntouched =
      loadOrdersBlock(current) !== "" && loadOrdersBlock(current) === loadOrdersBlock(original);

    // Behavioral: drive the approve mutation's onSuccess against a spy
    // QueryClient and assert the orders query is invalidated (the list
    // refreshes). React + react-query are mocked, so it runs headless in CI.
    const refreshTest = bunAvailable()
      ? await runBunTest(fixtureDir, "OrdersPanel.test.tsx")
      : { pass: false, stdout: "", stderr: "bun unavailable" };
    const hidden = await runHiddenTests("SB-04", fixtureDir);
    const refreshes = refreshTest.pass && hidden.total > 0 && hidden.rate === 1;

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "approve success refreshes the orders list (behavioral)",
            pass: refreshes,
            weight: 3,
            detail: refreshes ? undefined : refreshTest.stdout + "\n" + refreshTest.stderr,
          },
        ],
        scope: [
          {
            name: "edited only OrdersPanel.tsx",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "export surface unchanged",
            pass:
              currentExportCount === originalExportCount &&
              /export\s+function\s+OrdersPanel\s*\(/.test(current) &&
              !/export\s+(const|class|\{)/.test(current),
            weight: 1,
          },
          {
            name: "loadOrders helper left untouched",
            pass: loadOrdersUntouched,
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
          {
            name: "formatMoney helper left untouched",
            pass:
              extractFunction(current, "formatMoney") !== "" &&
              extractFunction(current, "formatMoney") === extractFunction(original, "formatMoney"),
            weight: 1,
          },
          {
            name: "getEmptyMessage helper left untouched",
            pass:
              extractFunction(current, "getEmptyMessage") !== "" &&
              extractFunction(current, "getEmptyMessage") ===
                extractFunction(original, "getEmptyMessage"),
            weight: 1,
          },
        ],
      },
      {
        pass: "Added the requested refresh and stayed disciplined about scope.",
        partial: "Fixed the refresh bug, but also drifted beyond the requested change.",
        fail: "Did not add the refresh correctly or rewrote unrelated parts of the file.",
      }
    );
  },
};

export default scenario;
