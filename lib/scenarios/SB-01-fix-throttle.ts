import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { checksToEvaluation, extractFunction, hasCall } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import {
  PLAYGROUND_SRC,
  firstChangeTurn,
  firstTurn,
  onlyChangedFiles,
  stripComments,
} from "./_shared/helpers.js";

export const meta = {
  id: "SB-01",
  name: "fix-throttle",
  category: "surgical-edit" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  fixturePath: "playground/",
  prompt: `The throttle function in playground/utils.js is broken — it's identical to debounce. Fix it so it actually throttles.`,
} as const;

const scenario: Scenario = {
  id: "SB-01" as ScenarioId,
  name: "fix-throttle",
  category: "surgical-edit",
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

    const checks = [
      {
        name: "read file before changing it (turn-ordered)",
        pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
      },
      {
        name: "used edit or write tool",
        pass: hasCall(toolCalls, "edit") || hasCall(toolCalls, "write"),
      },
      { name: "throttle differs from debounce", pass: throttleFn !== debounceFn },
      {
        name: "throttle has real throttle logic",
        pass: /Date\.now|lastRun|lastCall|waiting|canRun|trailing|leading|elapsed|diff|inProgress/.test(
          throttleFn
        ),
        detail: throttleFn.slice(0, 120),
      },
      {
        name: "debounce unchanged from original",
        pass: debounceFn !== "" && debounceFn === originalDebounce,
      },
      {
        name: "formatDate unchanged from original",
        pass: formatDate !== "" && formatDate === originalFormatDate,
      },
    ];

    return checksToEvaluation(checks, {
      pass: "Fixed throttle with real logic, left adjacent code untouched.",
      partial: "Fixed throttle but also touched adjacent code, or weak throttle logic.",
      fail: "Did not produce a valid throttle fix.",
    });
  },
};

export default scenario;
