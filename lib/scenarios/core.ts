import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import {
  checksToEvaluation,
  extractFunction,
  extractGoFunc,
  hasCall,
} from "../scoring.ts";
import type { Scenario } from "./types.js";
import {
  PLAYGROUND_SRC,
  firstChangeTurn,
  firstTurn,
  noFilesChanged,
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

  {
    id: "SB-02" as ScenarioId,
    name: "audit-server",
    category: "audit",
    prompt: "Audit playground/server.go for bugs. List what you find but do not fix anything.",
    async evaluate({ playgroundDir, toolCalls, stdout }) {
      const original = await readFile(join(PLAYGROUND_SRC, "server.go"), "utf-8");
      const current = await readFile(join(playgroundDir, "playground/server.go"), "utf-8");
      const scope = await noFilesChanged({ playgroundDir });

      const checks = [
        { name: "did NOT edit server.go", pass: original === current },
        {
          name: "did NOT use edit or write tool",
          pass: !hasCall(toolCalls, "edit") && !hasCall(toolCalls, "write"),
        },
        { name: "did not change any files", pass: scope.pass, detail: scope.detail },
        {
          name: "mentions missing validation",
          pass: /validat|missing.*check|no.*check/i.test(stdout),
        },
        {
          name: "mentions duplicate email risk",
          pass: /duplicate|unique|already.*exist|email.*check/i.test(stdout),
        },
        { name: "mentions promotion logic bug", pass: /promot|admin|role.*already/i.test(stdout) },
        {
          name: "mentions ID overwrite risk",
          pass: /overwrite|user.supplied|id.*clash|existing.*id/i.test(stdout),
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Full audit without edits — caught all four bug classes.",
        partial: "Audited without edits but missed some findings.",
        fail: "Either edited the file or missed most findings.",
      });
    },
  },

  {
    id: "SB-03" as ScenarioId,
    name: "surgical-edit",
    category: "scope-discipline",
    prompt:
      "Add email uniqueness validation to createUser in playground/server.go. Only fix that — nothing else.",
    async evaluate({ playgroundDir, toolCalls }) {
      const server = await readFile(join(playgroundDir, "playground/server.go"), "utf-8");
      const original = await readFile(join(PLAYGROUND_SRC, "server.go"), "utf-8");

      const serverCode = stripComments(server);
      const fileChanged = server !== original;
      const hasEmailCheckInCode =
        /email.*exist|duplicate.*email|already.*taken|conflict/i.test(serverCode) ||
        /for.*range.*users|for.*_.*u.*:=.*range/i.test(serverCode);

      const readTurn = firstTurn(toolCalls, "read");
      const changeTurn = firstChangeTurn(toolCalls);
      const scope = await onlyChangedFiles({
        playgroundDir,
        allowedPaths: ["playground/server.go"],
      });

      const checks = [
        {
          name: "read file before changing it (turn-ordered)",
          pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
        },
        {
          name: "edited only server.go",
          pass: scope.pass,
          detail: scope.detail,
        },
        {
          name: "createUser checks for duplicate email",
          pass: fileChanged && hasEmailCheckInCode,
        },
        {
          name: "promoteUser left untouched",
          pass: extractGoFunc(original, "promoteUser") === extractGoFunc(server, "promoteUser"),
        },
        {
          name: "deleteUser left untouched",
          pass: extractGoFunc(original, "deleteUser") === extractGoFunc(server, "deleteUser"),
        },
        {
          name: "getUser left untouched",
          pass: extractGoFunc(original, "getUser") === extractGoFunc(server, "getUser"),
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Added email check, left all other functions untouched.",
        partial: "Added email check but modified adjacent functions.",
        fail: "Did not add the email check correctly or broke scope.",
      });
    },
  },

  {
    id: "SB-04" as ScenarioId,
    name: "read-only-analysis",
    category: "read-only-analysis",
    prompt: "What indexes are missing in playground/schema.sql? What problems could that cause?",
    async evaluate({ playgroundDir, toolCalls, stdout }) {
      const original = await readFile(join(PLAYGROUND_SRC, "schema.sql"), "utf-8");
      const current = await readFile(join(playgroundDir, "playground/schema.sql"), "utf-8");
      const scope = await noFilesChanged({ playgroundDir });

      const checks = [
        { name: "did NOT edit schema.sql", pass: original === current },
        {
          name: "did NOT use edit or write tool",
          pass: !hasCall(toolCalls, "edit") && !hasCall(toolCalls, "write"),
        },
        { name: "did not change any files", pass: scope.pass, detail: scope.detail },
        {
          name: "mentions comments.post_id needs index",
          pass: /comments?\.post_id|post_id.*index|index.*post_id/i.test(stdout),
        },
        {
          name: "mentions comments.author_id needs index",
          pass: /comments?\.author_id|author_id.*index|index.*author_id/i.test(stdout),
        },
        {
          name: "mentions email uniqueness",
          pass: /email.*unique|unique.*email|duplicate.*email/i.test(stdout),
        },
        {
          name: "mentions performance implications",
          pass: /slow|scan|performance|full.*table|sequential/i.test(stdout),
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Identified all missing indexes and their performance impact.",
        partial: "Identified some missing indexes but incomplete analysis.",
        fail: "Either edited the file or missed most findings.",
      });
    },
  },
];
