import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { checksToEvaluation, extractFunction, hasCall } from "../scoring.ts";
import type { Scenario } from "./types.js";
import {
  PLAYGROUND_SRC,
  firstChangeTurn,
  firstTurn,
  onlyChangedFiles,
  stripComments,
} from "./helpers.js";

export const coreScenarios: Scenario[] = [
  {
    id: "SB-01" as ScenarioId,
    name: "fix-throttle",
    category: "surgical-edit",
    prompt:
      "The throttle function in playground/utils.js is broken — it's identical to debounce. Fix it so it actually throttles.",
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
  },
];
