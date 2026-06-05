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
} from "./_shared/helpers.js";
import { runHiddenTests } from "./_shared/evaluators/index.js";

export const meta = {
  id: "SB-01",
  name: "fix-throttle",
  category: "surgical-edit" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/",
  prompt: `The throttle function in playground/utils.js is broken — it's identical to debounce. Fix it so it actually throttles.`,
} as const;

const scenario: Scenario = {
  id: "SB-01" as ScenarioId,
  name: "fix-throttle",
  category: "surgical-edit",
  family: "regex-style",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, "playground");
    const utils = await readFile(join(fixtureDir, "utils.js"), "utf-8");
    const originalUtils = await readFile(join(PLAYGROUND_SRC, "utils.js"), "utf-8");
    const debounceFn = extractFunction(utils, "debounce");
    const formatDate = extractFunction(utils, "formatDate");
    const originalDebounce = extractFunction(originalUtils, "debounce");
    const originalFormatDate = extractFunction(originalUtils, "formatDate");

    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);

    // Behavioral signal: run the authoritative throttle-semantics test
    // (manual clock via setSystemTime) against the submitted utils.js.
    const hidden = await runHiddenTests("SB-01", fixtureDir);
    const throttleWorks = hidden.total > 0 && hidden.rate === 1;

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "throttle semantics test passes",
            pass: throttleWorks,
            weight: 3,
            detail: `${hidden.passed}/${hidden.total} throttle-semantics assertions passed`,
          },
        ],
        scope: [
          {
            name: "edited only utils.js",
            pass: (await onlyChangedFiles({ playgroundDir, allowedPaths: ["playground/utils.js"] }))
              .pass,
            weight: 2,
          },
        ],
        pattern: [
          {
            name: "debounce unchanged from original",
            pass: debounceFn !== "" && debounceFn === originalDebounce,
            weight: 1,
          },
          {
            name: "formatDate unchanged from original",
            pass: formatDate !== "" && formatDate === originalFormatDate,
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
            name: "no unrelated rewrite (comments match original)",
            pass: noAddedComments(utils, originalUtils),
            weight: 1,
          },
          {
            name: "no console.log added",
            pass: noConsoleLog(utils),
            weight: 1,
          },
        ],
      },
      {
        pass: "Throttle behaves correctly under a simulated clock, adjacent code untouched.",
        partial: "Throttle fix is incomplete, or adjacent code was touched.",
        fail: "Throttle does not throttle.",
      }
    );
  },
};

export default scenario;
