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

export const meta = {
  id: "SB-01",
  name: "fix-throttle",
  category: "surgical-edit" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "regex-shape" as const,
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
    const utils = await readFile(join(playgroundDir, "playground/utils.js"), "utf-8");
    const originalUtils = await readFile(join(PLAYGROUND_SRC, "utils.js"), "utf-8");
    const throttleFn = extractFunction(utils, "throttle");
    const debounceFn = extractFunction(utils, "debounce");
    const formatDate = extractFunction(utils, "formatDate");
    const originalDebounce = extractFunction(originalUtils, "debounce");
    const originalFormatDate = extractFunction(originalUtils, "formatDate");

    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);

    return rubricToEvaluation(
      {
        correctness: [
          { name: "throttle differs from debounce", pass: throttleFn !== debounceFn, weight: 1 },
          {
            name: "throttle has real throttle logic",
            pass: /Date\.now|lastRun|lastCall|waiting|canRun|trailing|leading|elapsed|diff|inProgress/.test(
              throttleFn
            ),
            weight: 2,
            detail: throttleFn.slice(0, 120),
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
            name: "no added comments",
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
        pass: "Fixed throttle with real logic, left adjacent code untouched.",
        partial: "Fixed throttle but also touched adjacent code, or weak throttle logic.",
        fail: "Did not produce a valid throttle fix.",
      }
    );
  },
};

export default scenario;
