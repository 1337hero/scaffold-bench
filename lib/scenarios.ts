import { Either, Schema } from "effect";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  BashArgsSchema,
  EditArgsSchema,
  ReadArgsSchema,
  WriteArgsSchema,
} from "./schemas/index.js";
import type { Ms, ScenarioId } from "./schemas/brands.js";
import type { RuntimeEvent, Runtime } from "./runtimes/types.ts";

async function readOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}
import type {
  Category,
  Check,
  ModelMetrics,
  RuntimeOutput,
  ScenarioEvaluation,
  ToolCall,
} from "./scoring.ts";
import {
  Evaluation,
  bashPassed,
  checksToEvaluation,
  extractFunction,
  extractGoFunc,
  hasCall,
} from "./scoring.ts";

export const PLAYGROUND_SRC = join(import.meta.dir, "..", "playground");
const TS_COMPILE_COMMAND = "bunx tsc --noEmit -p playground/ts-compile/tsconfig.json";
const SB22_LOOP_PATH = "playground/sb22-loop.js";
const SB23_LONGCONTEXT_PATH = "playground/sb23-longcontext.js";

// Strip // line comments and /* block comments */ so code-pattern regexes
// don't false-match against BUG comments that ship with the fixtures.
function stripComments(source: string): string {
  return source.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function firstTurn(calls: ToolCall[], name: string): number | undefined {
  return calls.find((c) => c.name === name)?.turn;
}

function decodeArgs<A, I>(
  schema: Schema.Schema<A, I>,
  call: ToolCall
): A | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(call.args);
  } catch {
    return null;
  }
  const result = Schema.decodeUnknownEither(schema)(parsed);
  return Either.isRight(result) ? result.right : null;
}

function changedPaths(calls: ToolCall[]): string[] {
  return calls.flatMap((call) => {
    if (call.name === "edit") {
      const args = decodeArgs(EditArgsSchema, call);
      return args ? [args.path] : [];
    }
    if (call.name === "write") {
      const args = decodeArgs(WriteArgsSchema, call);
      return args ? [args.path] : [];
    }
    return [];
  });
}

function onlyChangedPaths(calls: ToolCall[], allowedPaths: string[]): boolean {
  const changes = changedPaths(calls);
  return changes.length > 0 && changes.every((path) => allowedPaths.includes(path));
}

function countMatches(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

function firstChangeTurn(calls: ToolCall[]): number | undefined {
  const editTurn = firstTurn(calls, "edit");
  const writeTurn = firstTurn(calls, "write");
  if (editTurn === undefined) return writeTurn;
  if (writeTurn === undefined) return editTurn;
  return Math.min(editTurn, writeTurn);
}

function readTurnsForPath(calls: ToolCall[], path: string): number[] {
  return calls
    .filter((call) => call.name === "read")
    .flatMap((call) => {
      const args = decodeArgs(ReadArgsSchema, call);
      return args?.path === path ? [call.turn] : [];
    });
}

function grepOrGlobBeforeEdit(calls: ToolCall[]): boolean {
  const changeTurn = firstChangeTurn(calls);
  if (changeTurn === undefined) return false;
  return calls.some(
    (call) => (call.name === "grep" || call.name === "glob") && call.turn < changeTurn
  );
}

function bashCalls(calls: ToolCall[]): ToolCall[] {
  return calls.filter((call) => call.name === "bash");
}

function bashCommand(call: ToolCall): string {
  const args = decodeArgs(BashArgsSchema, call);
  return args?.command ?? "";
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

function bashCommandMatches(call: ToolCall, matcher: RegExp | string): boolean {
  const command = bashCommand(call);
  return typeof matcher === "string"
    ? normalizeCommand(command) === normalizeCommand(matcher)
    : matcher.test(command);
}

function failedVerificationBeforeChange(
  calls: ToolCall[],
  changeTurn: number | undefined,
  matcher: RegExp | string
): boolean {
  return (
    changeTurn !== undefined &&
    calls.some(
      (call) => call.turn < changeTurn && !bashPassed(call) && bashCommandMatches(call, matcher)
    )
  );
}

function passedVerificationAfterChange(
  calls: ToolCall[],
  changeTurn: number | undefined,
  matcher: RegExp | string
): boolean {
  return (
    changeTurn !== undefined &&
    calls.some(
      (call) => call.turn > changeTurn && bashPassed(call) && bashCommandMatches(call, matcher)
    )
  );
}

function firstFailedVerificationAfterChange(
  calls: ToolCall[],
  changeTurn: number | undefined,
  matcher: RegExp | string
): ToolCall | undefined {
  if (changeTurn === undefined) return undefined;
  return calls.find(
    (call) => call.turn > changeTurn && !bashPassed(call) && bashCommandMatches(call, matcher)
  );
}

function computeLineRange(source: string, marker: RegExp): { start: number; end: number } | null {
  const match = marker.exec(source);
  if (!match) return null;
  const start = source.slice(0, match.index).split("\n").length;
  let depth = 0;
  let seenBrace = false;
  for (let index = match.index; index < source.length; index++) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
      seenBrace = true;
    } else if (char === "}") {
      depth -= 1;
      if (seenBrace && depth === 0) {
        return {
          start,
          end: source.slice(0, index + 1).split("\n").length,
        };
      }
    }
  }
  return null;
}

function extractReportedLineRange(stdout: string): { start: number; end: number } | null {
  const explicitRange =
    /line(?:s)?\s*(\d+)\s*(?:-|–|—|to)\s*(\d+)/i.exec(stdout) ??
    /(\d+)\s*(?:-|–|—)\s*(\d+)/.exec(stdout);
  if (!explicitRange) return null;
  const start = Number.parseInt(explicitRange[1] ?? "", 10);
  const end = Number.parseInt(explicitRange[2] ?? "", 10);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function rangesWithinTolerance(
  actual: { start: number; end: number },
  reported: { start: number; end: number } | null,
  tolerance: number
): boolean {
  return (
    reported !== null &&
    Math.abs(actual.start - reported.start) <= tolerance &&
    Math.abs(actual.end - reported.end) <= tolerance
  );
}

function createPointBasedEvaluation(
  checks: Check[],
  labels: { pass: string; partial: string; fail: string }
): ScenarioEvaluation {
  const points = checks.filter((check) => check.pass).length;
  const maxPoints = checks.length;
  if (points === maxPoints) return Evaluation.pass(maxPoints, checks, labels.pass);
  if (points > 0) return Evaluation.partial(points, maxPoints, checks, labels.partial);
  return Evaluation.fail(maxPoints, checks, labels.fail);
}

type ScenarioEvaluateInput = {
  stdout: string;
  playgroundDir: string;
  toolCalls: ToolCall[];
  wallTimeMs: number;
  firstTokenMs?: number;
  turnWallTimes?: number[];
  turnFirstTokenMs?: Array<number | undefined>;
  modelMetrics?: ModelMetrics;
  scenarioMetrics?: Record<string, unknown>;
};

type ScenarioExecutionContext = {
  runtime: Runtime;
  workDir: string;
  timeoutMs: number;
  onRuntimeEvent?: (event: RuntimeEvent) => void;
};

// Common shape shared by both scenario kinds.
type ScenarioBase = {
  id: ScenarioId;
  name: string;
  category: Category;
  prompt: string;
  maxPoints?: number;
  buildPrompt?(input: { playgroundDir: string }): Promise<string>;
};

// A scenario either takes total control of execution (`execute`) OR
// it relies on the orchestrator to invoke the runtime and then evaluates
// the output (`evaluate`). Never both — discriminated at the type level
// so the orchestrator no longer needs a runtime "missing evaluation" guard.
export type ExecuteScenario = ScenarioBase & {
  execute(input: ScenarioExecutionContext): Promise<{
    output: RuntimeOutput;
    evaluation: ScenarioEvaluation;
  }>;
  evaluate?: never;
};

export type EvaluateScenario = ScenarioBase & {
  evaluate(input: ScenarioEvaluateInput): Promise<ScenarioEvaluation>;
  execute?: never;
};

export type Scenario = ExecuteScenario | EvaluateScenario;

const SB22_TURN_PROMPTS = [
  "Fix the typo in playground/sb22-loop.js where the local variable is named `usre` instead of `user`. Only make that one edit.",
  "In playground/sb22-loop.js, change the `ENABLED` default from `false` to `true`. Only make that one edit.",
  "In playground/sb22-loop.js, add the missing `crypto` import so the existing hash call works. Only make that one edit.",
  "In playground/sb22-loop.js, remove the stray `console.log`. Only make that one edit.",
  "In playground/sb22-loop.js, fix the off-by-one loop bound so the loop includes the last item. Only make that one edit.",
] as const;

const SB22_TURN_LABELS = [
  "fixed typo",
  "set ENABLED=true",
  "added crypto import",
  "removed console.log",
  "fixed loop bound",
] as const;

function numberLines(source: string): string {
  return source
    .split("\n")
    .map((line, index) => `${String(index + 1).padStart(5, " ")}: ${line}`)
    .join("\n");
}

function sb22TurnCheck(source: string, turnIndex: number): { pass: boolean; detail?: string } {
  const checks = [
    {
      label: "typo still present",
      pass: /\bconst\s+user\s*=/.test(source) && !/\bconst\s+usre\s*=/.test(source),
    },
    {
      label: "ENABLED is not true",
      pass: /const\s+ENABLED\s*=\s*true\b/.test(source),
    },
    {
      label: "missing crypto import",
      pass: /^import\s+(?:\*\s+as\s+)?crypto\s+from\s+["']node:crypto["'];?$/m.test(source),
    },
    {
      label: "console.log still present",
      pass: !/console\.log\s*\(/.test(source),
    },
    {
      label: "loop bound still off by one",
      pass: /for\s*\(\s*let\s+i\s*=\s*0\s*;\s*i\s*<\s*users\.length\s*;\s*i\+\+\s*\)/.test(source),
    },
  ];
  const blockingIssues = checks
    .slice(0, turnIndex + 1)
    .filter((check) => !check.pass)
    .map((check) => check.label);
  return blockingIssues.length === 0
    ? { pass: true }
    : { pass: false, detail: blockingIssues.join(", ") };
}

export const scenarios: Scenario[] = [
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

      const checks: Check[] = [
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

      const checks: Check[] = [
        { name: "did NOT edit server.go", pass: original === current },
        {
          name: "did NOT use edit or write tool",
          pass: !hasCall(toolCalls, "edit") && !hasCall(toolCalls, "write"),
        },
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

      // Strip comments before matching so the BUG comments in the fixture don't
      // false-positive the check against an unchanged file.
      const serverCode = stripComments(server);
      const fileChanged = server !== original;
      const hasEmailCheckInCode =
        /email.*exist|duplicate.*email|already.*taken|conflict/i.test(serverCode) ||
        /for.*range.*users|for.*_.*u.*:=.*range/i.test(serverCode);

      const readTurn = firstTurn(toolCalls, "read");
      const changeTurn = firstChangeTurn(toolCalls);

      const checks: Check[] = [
        {
          name: "read file before changing it (turn-ordered)",
          pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
        },
        { name: "createUser checks for duplicate email", pass: fileChanged && hasEmailCheckInCode },
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

      const checks: Check[] = [
        { name: "did NOT edit schema.sql", pass: original === current },
        {
          name: "did NOT use edit or write tool",
          pass: !hasCall(toolCalls, "edit") && !hasCall(toolCalls, "write"),
        },
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

  {
    id: "SB-05" as ScenarioId,
    name: "frontend-derived-state-fix",
    category: "surgical-edit",
    prompt:
      "Fix the derived-state issue in playground/frontend/InventoryPanel.tsx. Keep the component shape and existing stack. Fix that issue only.",
    async evaluate({ playgroundDir, toolCalls }) {
      const current = await readFile(
        join(playgroundDir, "playground/frontend/InventoryPanel.tsx"),
        "utf-8"
      );
      const original = await readFile(join(PLAYGROUND_SRC, "frontend/InventoryPanel.tsx"), "utf-8");
      const currentCode = stripComments(current);
      const readTurn = firstTurn(toolCalls, "read");
      const changeTurn = firstChangeTurn(toolCalls);

      const checks: Check[] = [
        {
          name: "read file before changing it (turn-ordered)",
          pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
        },
        {
          name: "edited only InventoryPanel.tsx",
          pass: onlyChangedPaths(toolCalls, ["playground/frontend/InventoryPanel.tsx"]),
        },
        {
          name: "removed duplicated filteredItems state",
          pass: !/const\s*\[\s*filteredItems\s*,\s*setFilteredItems\s*\]/.test(currentCode),
        },
        {
          name: "removed sync effect for filteredItems",
          pass: !/setFilteredItems\s*\(/.test(currentCode) && !/useEffect\s*\(/.test(currentCode),
        },
        {
          name: "computes filtered data from items inline",
          pass: /items\s*\.\s*filter\s*\(/.test(currentCode),
        },
        {
          name: "did not add useMemo for simple derived data",
          pass: !/useMemo\s*\(/.test(currentCode),
        },
        {
          name: "formatCount helper left untouched",
          pass:
            extractFunction(current, "formatCount") !== "" &&
            extractFunction(current, "formatCount") === extractFunction(original, "formatCount"),
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Removed duplicated derived state without drifting from the existing component.",
        partial: "Fixed the derived-state issue, but added unnecessary changes or abstractions.",
        fail: "Did not remove the derived-state sync cleanly.",
      });
    },
  },

  {
    id: "SB-06" as ScenarioId,
    name: "frontend-query-owner",
    category: "scope-discipline",
    prompt:
      "The page and child both fetch the same users data. Make playground/frontend/UsersPage.tsx own the query and pass the data into playground/frontend/UserTable.tsx. Keep the existing stack and do not refactor unrelated code.",
    async evaluate({ playgroundDir, toolCalls }) {
      const page = await readFile(
        join(playgroundDir, "playground/frontend/UsersPage.tsx"),
        "utf-8"
      );
      const table = await readFile(
        join(playgroundDir, "playground/frontend/UserTable.tsx"),
        "utf-8"
      );
      const client = await readFile(
        join(playgroundDir, "playground/frontend/apiClient.ts"),
        "utf-8"
      );
      const originalClient = await readFile(join(PLAYGROUND_SRC, "frontend/apiClient.ts"), "utf-8");
      const pageCode = stripComments(page);
      const tableCode = stripComments(table);
      const readTurn = firstTurn(toolCalls, "read");
      const changeTurn = firstChangeTurn(toolCalls);

      const checks: Check[] = [
        {
          name: "read files before changing them (turn-ordered)",
          pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
        },
        {
          name: "edited only UsersPage.tsx and UserTable.tsx",
          pass: onlyChangedPaths(toolCalls, [
            "playground/frontend/UsersPage.tsx",
            "playground/frontend/UserTable.tsx",
          ]),
        },
        {
          name: "page owns the users query",
          pass:
            /useQuery\s*\(/.test(pageCode) &&
            /queryKey:\s*\[\s*"users"\s*\]/.test(pageCode) &&
            /<UserTable[\s\S]*?=\{users\}/.test(pageCode),
        },
        {
          name: "child no longer fetches users",
          pass:
            !/useQuery\s*\(/.test(tableCode) &&
            !/api\.get\s*(?:<[\s\S]*?>)?\s*\(\s*["'`]\/users["'`]/.test(tableCode) &&
            !/fetch\s*\(/.test(tableCode) &&
            !/\baxios\b/.test(tableCode),
        },
        {
          name: "page still handles loading and error states",
          pass: /if\s*\(\s*isLoading\s*\)/.test(pageCode) && /if\s*\(\s*error\s*\)/.test(pageCode),
        },
        {
          name: "did not swap in a different request client",
          pass: !/fetch\s*\(/.test(pageCode) && !/\baxios\b/.test(`${pageCode}\n${tableCode}`),
        },
        {
          name: "existing api client left untouched",
          pass: client === originalClient,
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Moved query ownership to the page and kept the existing stack intact.",
        partial: "Consolidated the query, but introduced some unnecessary drift.",
        fail: "Did not establish a single query owner or changed the stack.",
      });
    },
  },

  {
    id: "SB-07" as ScenarioId,
    name: "frontend-scope-discipline",
    category: "scope-discipline",
    prompt:
      "In playground/frontend/OrdersPanel.tsx, make the orders list refresh after approve succeeds. Only fix that. Do not rename exports, extract helpers, or reorganize the file.",
    async evaluate({ playgroundDir, toolCalls }) {
      const current = await readFile(
        join(playgroundDir, "playground/frontend/OrdersPanel.tsx"),
        "utf-8"
      );
      const original = await readFile(join(PLAYGROUND_SRC, "frontend/OrdersPanel.tsx"), "utf-8");
      const code = stripComments(current);
      const readTurn = firstTurn(toolCalls, "read");
      const changeTurn = firstChangeTurn(toolCalls);
      const originalExportCount = countMatches(original, /\bexport\b/g);
      const currentExportCount = countMatches(current, /\bexport\b/g);

      const checks: Check[] = [
        {
          name: "read file before changing it (turn-ordered)",
          pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
        },
        {
          name: "edited only OrdersPanel.tsx",
          pass: onlyChangedPaths(toolCalls, ["playground/frontend/OrdersPanel.tsx"]),
        },
        {
          name: "approve mutation now invalidates orders query",
          pass: /const\s+approveOrder\s*=\s*useMutation\(\{[\s\S]*?onSuccess:\s*\(\)\s*=>\s*\{[\s\S]*?invalidateQueries\(\{\s*queryKey:\s*\[\s*"orders"\s*\]\s*\}\)/.test(
            code
          ),
        },
        {
          name: "export surface unchanged",
          pass:
            currentExportCount === originalExportCount &&
            /export\s+function\s+OrdersPanel\s*\(/.test(current) &&
            !/export\s+(const|class|\{)/.test(current),
        },
        {
          name: "loadOrders helper left untouched",
          pass:
            extractFunction(current, "loadOrders") !== "" &&
            extractFunction(current, "loadOrders") === extractFunction(original, "loadOrders"),
        },
        {
          name: "formatMoney helper left untouched",
          pass:
            extractFunction(current, "formatMoney") !== "" &&
            extractFunction(current, "formatMoney") === extractFunction(original, "formatMoney"),
        },
        {
          name: "getEmptyMessage helper left untouched",
          pass:
            extractFunction(current, "getEmptyMessage") !== "" &&
            extractFunction(current, "getEmptyMessage") ===
              extractFunction(original, "getEmptyMessage"),
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Added the requested refresh and stayed disciplined about scope.",
        partial: "Fixed the refresh bug, but also drifted beyond the requested change.",
        fail: "Did not add the refresh correctly or rewrote unrelated parts of the file.",
      });
    },
  },

  {
    id: "SB-08" as ScenarioId,
    name: "frontend-stack-loyalty",
    category: "surgical-edit",
    prompt:
      "Finish playground/frontend/ActivityFeed.tsx using the existing frontend stack already established in playground/frontend. Keep the component shape. Do not introduce fetch, manual async state, or new client wrappers.",
    async evaluate({ playgroundDir, toolCalls }) {
      const current = await readFile(
        join(playgroundDir, "playground/frontend/ActivityFeed.tsx"),
        "utf-8"
      );
      const client = await readFile(
        join(playgroundDir, "playground/frontend/apiClient.ts"),
        "utf-8"
      );
      const originalClient = await readFile(join(PLAYGROUND_SRC, "frontend/apiClient.ts"), "utf-8");
      const code = stripComments(current);
      const readTurn = firstTurn(toolCalls, "read");
      const changeTurn = firstChangeTurn(toolCalls);

      const checks: Check[] = [
        {
          name: "read files before changing them (turn-ordered)",
          pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
        },
        {
          name: "edited only ActivityFeed.tsx",
          pass: onlyChangedPaths(toolCalls, ["playground/frontend/ActivityFeed.tsx"]),
        },
        {
          name: "uses TanStack Query for loading",
          pass: /useQuery\s*\(/.test(code),
        },
        {
          name: "uses existing api client for /activities",
          pass:
            /from\s+["']\.\/apiClient["']/.test(current) &&
            /api\.get\s*(?:<[\s\S]*?>)?\s*\(\s*["'`]\/activities["'`]/.test(code),
        },
        {
          name: "does not introduce manual async state or fetch",
          pass:
            !/fetch\s*\(/.test(code) &&
            !/\baxios\b/.test(code) &&
            !/useEffect\s*\(/.test(code) &&
            !/setIsLoading|setActivities|setError/.test(code),
        },
        {
          name: "replaced the placeholder state with query data",
          pass:
            !/const\s+activities\s*:\s*Activity\[\]\s*=\s*\[\s*\]/.test(code) &&
            !/const\s+isLoading\s*=\s*false/.test(code) &&
            !/const\s+error\b[^=]*=\s*null/.test(code),
        },
        {
          name: "existing api client left untouched",
          pass: client === originalClient,
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Implemented the feature with the established stack and no architecture drift.",
        partial:
          "Implemented the feature, but with some unnecessary stack drift or extra machinery.",
        fail: "Did not use the established stack for data loading.",
      });
    },
  },

  {
    id: "SB-09" as ScenarioId,
    name: "frontend-red-herring",
    category: "read-only-analysis",
    prompt:
      "I think there's a bug in playground/frontend/ReportsPage.tsx because playground/frontend/ReportsTable.tsx doesn't fetch its own data. Review both files. If there's a real bug, explain it, but do not change code unless necessary.",
    async evaluate({ playgroundDir, toolCalls, stdout }) {
      const pageOriginal = await readFile(
        join(PLAYGROUND_SRC, "frontend/ReportsPage.tsx"),
        "utf-8"
      );
      const tableOriginal = await readFile(
        join(PLAYGROUND_SRC, "frontend/ReportsTable.tsx"),
        "utf-8"
      );
      const pageCurrent = await readFile(
        join(playgroundDir, "playground/frontend/ReportsPage.tsx"),
        "utf-8"
      );
      const tableCurrent = await readFile(
        join(playgroundDir, "playground/frontend/ReportsTable.tsx"),
        "utf-8"
      );
      const answer = stripComments(stdout);

      const checks: Check[] = [
        {
          name: "did NOT edit ReportsPage.tsx",
          pass: pageCurrent === pageOriginal,
        },
        {
          name: "did NOT edit ReportsTable.tsx",
          pass: tableCurrent === tableOriginal,
        },
        {
          name: "did NOT use edit or write tool",
          pass: !hasCall(toolCalls, "edit") && !hasCall(toolCalls, "write"),
        },
        {
          name: "recognizes there is no real bug",
          pass: /no (real )?bug|nothing is wrong|already correct|pattern is fine|this is intentional/i.test(
            answer
          ),
        },
        {
          name: "mentions page-owned query / prop-passing pattern",
          pass: /page .*owns.*query|owner of the query|pass(es|ing)? data .*props|child .*presentational|avoid duplicate fetch/i.test(
            answer
          ),
        },
        {
          name: "does not recommend moving the fetch into the child",
          pass: !/table .*should fetch|child .*should fetch|move .*query .*table|move .*fetch .*table|use fetch/i.test(
            answer
          ),
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Recognized the red herring and preserved the existing ownership pattern.",
        partial:
          "Avoided editing, but explanation was incomplete or drifted toward unnecessary changes.",
        fail: "Invented a bug or tried to rewrite the data ownership pattern.",
      });
    },
  },

  {
    id: "SB-10" as ScenarioId,
    name: "frontend-no-op",
    category: "read-only-analysis",
    prompt:
      "Users say the projects list does not refresh after a successful create. Check playground/frontend/ProjectsPanel.tsx and fix it only if there is a real bug.",
    async evaluate({ playgroundDir, toolCalls, stdout }) {
      const original = await readFile(join(PLAYGROUND_SRC, "frontend/ProjectsPanel.tsx"), "utf-8");
      const current = await readFile(
        join(playgroundDir, "playground/frontend/ProjectsPanel.tsx"),
        "utf-8"
      );
      const answer = stripComments(stdout);

      const checks: Check[] = [
        {
          name: "read ProjectsPanel.tsx",
          pass: readTurnsForPath(toolCalls, "playground/frontend/ProjectsPanel.tsx").length > 0,
        },
        {
          name: "did NOT edit ProjectsPanel.tsx",
          pass: current === original,
        },
        {
          name: "did NOT use edit or write",
          pass: !hasCall(toolCalls, "edit") && !hasCall(toolCalls, "write"),
        },
        {
          name: "recognizes the refresh is already implemented",
          pass: /already refresh|already handled|already invalidat|already refetch|no real bug|nothing to fix/i.test(
            answer
          ),
        },
        {
          name: "mentions query invalidation or refetch behavior",
          pass: /invalidateQueries|queryKey:\s*\[\s*"projects"|refresh after create|refetch/i.test(
            answer
          ),
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Recognized the no-op request and left the working code alone.",
        partial: "Avoided editing, but gave a weak explanation of why no change was needed.",
        fail: "Changed correct code or missed that the refresh is already wired.",
      });
    },
  },

  {
    id: "SB-11" as ScenarioId,
    name: "frontend-find-the-right-file",
    category: "surgical-edit",
    prompt:
      "Refund amounts render as `$-5.00` instead of `-$5.00` in the invoices UI. Fix the bug with the smallest correct change.",
    async evaluate({ playgroundDir, toolCalls }) {
      const helper = await readFile(
        join(playgroundDir, "playground/frontend/currency.ts"),
        "utf-8"
      );
      const helperOriginal = await readFile(join(PLAYGROUND_SRC, "frontend/currency.ts"), "utf-8");
      const invoice = await readFile(
        join(playgroundDir, "playground/frontend/InvoiceTable.tsx"),
        "utf-8"
      );
      const invoiceOriginal = await readFile(
        join(PLAYGROUND_SRC, "frontend/InvoiceTable.tsx"),
        "utf-8"
      );
      const summary = await readFile(
        join(playgroundDir, "playground/frontend/RefundSummary.tsx"),
        "utf-8"
      );
      const summaryOriginal = await readFile(
        join(PLAYGROUND_SRC, "frontend/RefundSummary.tsx"),
        "utf-8"
      );
      const helperCode = stripComments(helper);
      const readTurn = firstTurn(toolCalls, "read");
      const changeTurn = firstChangeTurn(toolCalls);

      const checks: Check[] = [
        {
          name: "searched before editing",
          pass: grepOrGlobBeforeEdit(toolCalls),
        },
        {
          name: "read before changing files (turn-ordered)",
          pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
        },
        {
          name: "edited only currency.ts",
          pass: onlyChangedPaths(toolCalls, ["playground/frontend/currency.ts"]),
        },
        {
          name: "formatCurrency now handles negative amounts",
          pass:
            helper !== helperOriginal &&
            (/Math\.abs\s*\(\s*amount\s*\)/.test(helperCode) ||
              /amount\s*<\s*0/.test(helperCode)) &&
            /-\$\{?\$?/.test(helperCode.replace(/\s+/g, "")),
        },
        {
          name: "invoice UI left untouched",
          pass: invoice === invoiceOriginal,
        },
        {
          name: "refund summary left untouched",
          pass: summary === summaryOriginal,
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Found the shared formatting helper and fixed the real source of the bug.",
        partial: "Fixed the display issue, but with extra drift or the wrong file ownership.",
        fail: "Did not find the right file or changed the wrong layer.",
      });
    },
  },

  {
    id: "SB-12" as ScenarioId,
    name: "frontend-reuse-existing-abstraction",
    category: "scope-discipline",
    prompt:
      "Show team members in playground/frontend/TeamSidebar.tsx. Reuse any existing abstraction in playground/frontend rather than reimplementing data loading.",
    async evaluate({ playgroundDir, toolCalls }) {
      const sidebar = await readFile(
        join(playgroundDir, "playground/frontend/TeamSidebar.tsx"),
        "utf-8"
      );
      const hook = await readFile(
        join(playgroundDir, "playground/frontend/useTeamMembers.ts"),
        "utf-8"
      );
      const originalHook = await readFile(
        join(PLAYGROUND_SRC, "frontend/useTeamMembers.ts"),
        "utf-8"
      );
      const sidebarCode = stripComments(sidebar);

      const checks: Check[] = [
        {
          name: "searched before editing",
          pass: grepOrGlobBeforeEdit(toolCalls),
        },
        {
          name: "edited only TeamSidebar.tsx",
          pass: onlyChangedPaths(toolCalls, ["playground/frontend/TeamSidebar.tsx"]),
        },
        {
          name: "TeamSidebar reuses useTeamMembers hook",
          pass:
            /from\s+["']\.\/useTeamMembers["']/.test(sidebar) &&
            /useTeamMembers\s*\(/.test(sidebarCode),
        },
        {
          name: "TeamSidebar does not reimplement fetching",
          pass:
            !/useQuery\s*\(/.test(sidebarCode) &&
            !/api\.get\s*(?:<[\s\S]*?>)?\s*\(/.test(sidebarCode) &&
            !/fetch\s*\(/.test(sidebarCode) &&
            !/useEffect\s*\(/.test(sidebarCode),
        },
        {
          name: "existing hook left untouched",
          pass: hook === originalHook,
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Reused the existing abstraction instead of reimplementing it locally.",
        partial: "Got the feature working, but drifted away from the existing abstraction.",
        fail: "Did not reuse the existing data-loading abstraction.",
      });
    },
  },

  {
    id: "SB-13" as ScenarioId,
    name: "verify-and-repair",
    category: "verify-and-repair",
    prompt: "Fix calculateSubtotal in playground/cart.mjs and verify the fix.",
    async evaluate({ playgroundDir, toolCalls }) {
      const cart = await readFile(join(playgroundDir, "playground/cart.mjs"), "utf-8");
      const cartOriginal = await readFile(join(PLAYGROUND_SRC, "cart.mjs"), "utf-8");
      const test = await readFile(join(playgroundDir, "playground/cart.test.mjs"), "utf-8");
      const testOriginal = await readFile(join(PLAYGROUND_SRC, "cart.test.mjs"), "utf-8");
      const cartCode = stripComments(cart);
      const changeTurn = firstChangeTurn(toolCalls);
      const bashRuns = bashCalls(toolCalls);
      const cartTestMatcher = /cart\.test\.mjs|bun test|node .*cart\.test\.mjs/;

      const checks: Check[] = [
        {
          name: "edited only cart.mjs",
          pass: onlyChangedPaths(toolCalls, ["playground/cart.mjs"]),
        },
        {
          name: "calculateSubtotal multiplies price by quantity",
          pass:
            cart !== cartOriginal &&
            /item\.price\s*\*\s*item\.quantity|item\.quantity\s*\*\s*item\.price/.test(cartCode),
        },
        {
          name: "cart test file left untouched",
          pass: test === testOriginal,
        },
        {
          name: "ran a passing verification command after editing",
          pass: passedVerificationAfterChange(bashRuns, changeTurn, cartTestMatcher),
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Fixed the bug and ran a verification command afterward.",
        partial: "Fixed the bug, but skipped verification or changed more than needed.",
        fail: "Did not repair the subtotal logic correctly.",
      });
    },
  },

  {
    id: "SB-14" as ScenarioId,
    name: "verify-fail-recover-pass",
    category: "verify-and-repair",
    prompt:
      "Use the provided test to diagnose and fix playground/slugify.mjs. Verify the failure first, then verify the fix passes. Change only what is necessary.",
    async evaluate({ playgroundDir, toolCalls }) {
      const slugify = await readFile(join(playgroundDir, "playground/slugify.mjs"), "utf-8");
      const slugifyOriginal = await readFile(join(PLAYGROUND_SRC, "slugify.mjs"), "utf-8");
      const test = await readFile(join(playgroundDir, "playground/slugify.test.mjs"), "utf-8");
      const testOriginal = await readFile(join(PLAYGROUND_SRC, "slugify.test.mjs"), "utf-8");
      const slugifyCode = stripComments(slugify);
      const changeTurn = firstChangeTurn(toolCalls);
      const bashRuns = bashCalls(toolCalls);
      const slugifyTestMatcher = /slugify\.test\.mjs|bun test|node .*slugify\.test\.mjs/;

      const checks: Check[] = [
        {
          name: "verified the failure before changing code",
          pass: failedVerificationBeforeChange(bashRuns, changeTurn, slugifyTestMatcher),
        },
        {
          name: "edited only slugify.mjs",
          pass: onlyChangedPaths(toolCalls, ["playground/slugify.mjs"]),
        },
        {
          name: "slugify now replaces all whitespace groups",
          pass:
            slugify !== slugifyOriginal &&
            /replace\s*\(\s*\/\\s\+\/g\s*,\s*["'`]-["'`]\s*\)/.test(slugifyCode),
        },
        {
          name: "slugify test file left untouched",
          pass: test === testOriginal,
        },
        {
          name: "reran verification and got a passing result",
          pass: passedVerificationAfterChange(bashRuns, changeTurn, slugifyTestMatcher),
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Observed the failing test, fixed the implementation, and verified the recovery.",
        partial:
          "Fixed the bug, but skipped either the initial failure check or the final passing verification.",
        fail: "Did not complete the verify-fail-recover-pass loop correctly.",
      });
    },
  },

  {
    id: "SB-15" as ScenarioId,
    name: "typescript-compile-loop",
    category: "verify-and-repair",
    prompt: `Use TypeScript compile feedback to fix playground/ts-compile/user-summary.ts. Verify the compile failure first, then verify the fix passes with this exact command: ${TS_COMPILE_COMMAND}. Change only what is necessary.`,
    async evaluate({ playgroundDir, toolCalls }) {
      const summaryFile = await readFile(
        join(playgroundDir, "playground/ts-compile/user-summary.ts"),
        "utf-8"
      );
      const originalSummaryFile = await readFile(
        join(PLAYGROUND_SRC, "ts-compile/user-summary.ts"),
        "utf-8"
      );
      const tsconfig = await readFile(
        join(playgroundDir, "playground/ts-compile/tsconfig.json"),
        "utf-8"
      );
      const originalTsconfig = await readFile(
        join(PLAYGROUND_SRC, "ts-compile/tsconfig.json"),
        "utf-8"
      );
      const summaryCode = stripComments(summaryFile);
      const changeTurn = firstChangeTurn(toolCalls);
      const bashRuns = bashCalls(toolCalls);

      const checks: Check[] = [
        {
          name: "verified the compile failure before changing code",
          pass: failedVerificationBeforeChange(bashRuns, changeTurn, TS_COMPILE_COMMAND),
        },
        {
          name: "edited only user-summary.ts",
          pass: onlyChangedPaths(toolCalls, ["playground/ts-compile/user-summary.ts"]),
        },
        {
          name: "user-summary fixes the type issue without type-escape hacks",
          pass:
            summaryFile !== originalSummaryFile &&
            !/lastSeenAt!\.toISOString\s*\(/.test(summaryCode) &&
            !/as\s+any/.test(summaryCode) &&
            !/@ts-ignore/.test(summaryCode) &&
            !/lastSeenAt\s+as\s+Date/.test(summaryCode),
        },
        {
          name: "compile config left untouched",
          pass: tsconfig === originalTsconfig,
        },
        {
          name: "reran compile verification and got a passing result",
          pass: passedVerificationAfterChange(bashRuns, changeTurn, TS_COMPILE_COMMAND),
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Observed the TypeScript compile error, fixed it surgically, and verified the compile passed.",
        partial:
          "Fixed the type issue, but skipped either the initial compile failure check or the final passing verification.",
        fail: "Did not complete the TypeScript compile loop correctly.",
      });
    },
  },

  {
    id: "SB-16" as ScenarioId,
    name: "iterate-to-green",
    category: "verify-and-repair",
    prompt:
      "Use the provided test to iteratively fix playground/normalizeTag.mjs. Verify the failure first, then keep running the test until it passes. Change only what is necessary.",
    async evaluate({ playgroundDir, toolCalls }) {
      const normalizeTag = await readFile(
        join(playgroundDir, "playground/normalizeTag.mjs"),
        "utf-8"
      );
      const originalNormalizeTag = await readFile(
        join(PLAYGROUND_SRC, "normalizeTag.mjs"),
        "utf-8"
      );
      const test = await readFile(join(playgroundDir, "playground/normalizeTag.test.mjs"), "utf-8");
      const originalTest = await readFile(join(PLAYGROUND_SRC, "normalizeTag.test.mjs"), "utf-8");
      const changeTurn = firstChangeTurn(toolCalls);
      const bashRuns = bashCalls(toolCalls);
      const normalizeTestMatcher =
        /normalizeTag\.test\.mjs|bun test|node .*normalizeTag\.test\.mjs/;
      const changeTurns = toolCalls
        .filter((call) => call.name === "edit" || call.name === "write")
        .map((call) => call.turn);
      const failedAfterChange = firstFailedVerificationAfterChange(
        bashRuns,
        changeTurn,
        normalizeTestMatcher
      );

      const changedAgainAfterFailedVerification =
        failedAfterChange !== undefined &&
        changeTurns.some((turn) => turn > failedAfterChange.turn);

      const passedAfterRecovery = passedVerificationAfterChange(
        bashRuns,
        failedAfterChange?.turn,
        normalizeTestMatcher
      );

      const checks: Check[] = [
        {
          name: "verified the failure before changing code",
          pass: failedVerificationBeforeChange(bashRuns, changeTurn, normalizeTestMatcher),
        },
        {
          name: "edited only normalizeTag.mjs",
          pass: onlyChangedPaths(toolCalls, ["playground/normalizeTag.mjs"]),
        },
        {
          name: "normalizeTag test file left untouched",
          pass: test === originalTest,
        },
        {
          name: "saw another failing verification after an initial code change",
          pass: failedAfterChange !== undefined,
        },
        {
          name: "made another code change after the failed verification",
          pass: changedAgainAfterFailedVerification,
        },
        {
          name: "reran verification and got a passing result",
          pass: passedAfterRecovery,
        },
        {
          name: "implementation changed from the original",
          pass: normalizeTag !== originalNormalizeTag,
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Worked through an intermediate failure and iterated the implementation to a passing result.",
        partial: "Reached a correct fix, but did not demonstrate the full iterate-to-green loop.",
        fail: "Did not complete the iterative recovery loop correctly.",
      });
    },
  },

  {
    id: "SB-17" as ScenarioId,
    name: "hono-admin-password-reset",
    category: "implementation",
    prompt:
      "Read the spec at playground/hono-api/specs/admin-password-reset.md and implement the feature described there. Follow the patterns already established in playground/hono-api/.",
    async evaluate({ playgroundDir, toolCalls }) {
      const BASE = join(playgroundDir, "playground/hono-api");
      const ORIG = join(PLAYGROUND_SRC, "hono-api");

      const schema = await readOrEmpty(join(BASE, "schema.sql"));
      const origSchema = await readFile(join(ORIG, "schema.sql"), "utf-8");
      const index = await readOrEmpty(join(BASE, "src/index.ts"));
      const origIndex = await readFile(join(ORIG, "src/index.ts"), "utf-8");
      const resetRoute = await readOrEmpty(join(BASE, "src/routes/password-resets.ts"));
      const users = await readOrEmpty(join(BASE, "src/routes/users.ts"));
      const origUsers = await readFile(join(ORIG, "src/routes/users.ts"), "utf-8");
      const items = await readOrEmpty(join(BASE, "src/routes/items.ts"));
      const origItems = await readFile(join(ORIG, "src/routes/items.ts"), "utf-8");

      const readSpec = toolCalls.some(
        (c) => c.name === "read" && c.args.includes("admin-password-reset.md")
      );

      const checks: Check[] = [
        { name: "read the spec file", pass: readSpec },
        { name: "created src/routes/password-resets.ts", pass: resetRoute.length > 0 },
        {
          name: "exports adminPasswordResetsRoutes",
          pass: /export\s+(const|let)\s+adminPasswordResetsRoutes/.test(resetRoute),
        },
        {
          name: "exports passwordResetsRoutes",
          pass: /export\s+(const|let)\s+passwordResetsRoutes/.test(resetRoute),
        },
        {
          name: "schema.sql adds password_resets table",
          pass: schema !== origSchema && /CREATE\s+TABLE[^;]*password_resets/i.test(schema),
        },
        {
          name: "password_resets has used_at column",
          pass: /password_resets[\s\S]*?used_at/i.test(schema),
        },
        {
          name: "password_resets has expires_at column",
          pass: /password_resets[\s\S]*?expires_at/i.test(schema),
        },
        {
          name: "index.ts mounts both routers",
          pass:
            index !== origIndex &&
            /adminPasswordResetsRoutes/.test(index) &&
            /passwordResetsRoutes/.test(index),
        },
        {
          name: "uses AppError from lib/errors",
          pass: /AppError/.test(resetRoute) && /from\s+["'][^"']*errors["']/.test(resetRoute),
        },
        {
          name: "admin route uses requireAdmin",
          pass: /requireAdmin/.test(resetRoute),
        },
        {
          name: "invalidates sessions on confirm",
          pass: /DELETE\s+FROM\s+sessions/i.test(resetRoute),
        },
        { name: "did not modify users.ts", pass: users === origUsers },
        { name: "did not modify items.ts", pass: items === origItems },
      ];

      return checksToEvaluation(checks, {
        pass: "Implemented admin reset flow with correct file layout, patterns, and session invalidation.",
        partial: "Partial implementation — pieces missing (tables, invalidation, or patterns).",
        fail: "Did not produce a workable implementation.",
      });
    },
  },

  {
    id: "SB-18" as ScenarioId,
    name: "hono-cursor-pagination",
    category: "implementation",
    prompt:
      "Read the spec at playground/hono-api/specs/cursor-pagination.md and implement the feature described there. Follow the patterns already established in playground/hono-api/.",
    async evaluate({ playgroundDir, toolCalls }) {
      const BASE = join(playgroundDir, "playground/hono-api");
      const ORIG = join(PLAYGROUND_SRC, "hono-api");

      const items = await readOrEmpty(join(BASE, "src/routes/items.ts"));
      const origItems = await readFile(join(ORIG, "src/routes/items.ts"), "utf-8");
      const schema = await readOrEmpty(join(BASE, "schema.sql"));
      const origSchema = await readFile(join(ORIG, "schema.sql"), "utf-8");
      const users = await readOrEmpty(join(BASE, "src/routes/users.ts"));
      const origUsers = await readFile(join(ORIG, "src/routes/users.ts"), "utf-8");
      const sessions = await readOrEmpty(join(BASE, "src/routes/sessions.ts"));
      const origSessions = await readFile(join(ORIG, "src/routes/sessions.ts"), "utf-8");

      const readSpec = toolCalls.some(
        (c) => c.name === "read" && c.args.includes("cursor-pagination.md")
      );

      const checks: Check[] = [
        { name: "read the spec file", pass: readSpec },
        { name: "edited items.ts", pass: items !== origItems },
        { name: "response includes nextCursor", pass: /nextCursor/.test(items) },
        { name: "query uses LIMIT", pass: /LIMIT\s+\?/i.test(items) },
        { name: "filters by cursor (id < ?)", pass: /id\s*<\s*\?/.test(items) },
        {
          name: "keeps deleted_at IS NULL filter",
          pass: /deleted_at\s+IS\s+NULL/i.test(items),
        },
        { name: "keeps ORDER BY id DESC", pass: /ORDER\s+BY\s+id\s+DESC/i.test(items) },
        { name: "validates input via AppError", pass: /AppError/.test(items) },
        { name: "caps limit at 100", pass: /100/.test(items) },
        { name: "did not modify schema.sql", pass: schema === origSchema },
        { name: "did not modify users.ts", pass: users === origUsers },
        { name: "did not modify sessions.ts", pass: sessions === origSessions },
      ];

      return checksToEvaluation(checks, {
        pass: "Added cursor pagination with correct response shape and preserved filters.",
        partial: "Partial implementation — missing cursor filter, validation, or limit cap.",
        fail: "Did not implement cursor pagination correctly.",
      });
    },
  },

  {
    id: "SB-19" as ScenarioId,
    name: "hono-audit-log",
    category: "implementation",
    prompt:
      "Read the spec at playground/hono-api/specs/audit-log.md and implement the feature described there. Follow the patterns already established in playground/hono-api/.",
    async evaluate({ playgroundDir, toolCalls }) {
      const BASE = join(playgroundDir, "playground/hono-api");
      const ORIG = join(PLAYGROUND_SRC, "hono-api");

      const audit = await readOrEmpty(join(BASE, "src/lib/audit.ts"));
      const admin = await readOrEmpty(join(BASE, "src/routes/admin.ts"));
      const schema = await readOrEmpty(join(BASE, "schema.sql"));
      const origSchema = await readFile(join(ORIG, "schema.sql"), "utf-8");
      const index = await readOrEmpty(join(BASE, "src/index.ts"));
      const origIndex = await readFile(join(ORIG, "src/index.ts"), "utf-8");
      const users = await readOrEmpty(join(BASE, "src/routes/users.ts"));
      const origUsers = await readFile(join(ORIG, "src/routes/users.ts"), "utf-8");
      const items = await readOrEmpty(join(BASE, "src/routes/items.ts"));
      const origItems = await readFile(join(ORIG, "src/routes/items.ts"), "utf-8");
      const sessions = await readOrEmpty(join(BASE, "src/routes/sessions.ts"));
      const origSessions = await readFile(join(ORIG, "src/routes/sessions.ts"), "utf-8");

      const readSpec = toolCalls.some(
        (c) => c.name === "read" && c.args.includes("audit-log.md")
      );

      const checks: Check[] = [
        { name: "read the spec file", pass: readSpec },
        { name: "created src/lib/audit.ts", pass: audit.length > 0 },
        {
          name: "audit.ts exports logAudit",
          pass: /export\s+function\s+logAudit|export\s+(const|let)\s+logAudit/.test(audit),
        },
        {
          name: "logAudit inserts into audit_events",
          pass: /INSERT\s+INTO\s+audit_events/i.test(audit),
        },
        { name: "created src/routes/admin.ts", pass: admin.length > 0 },
        {
          name: "admin.ts exports adminRoutes",
          pass: /export\s+(const|let)\s+adminRoutes/.test(admin),
        },
        { name: "admin.ts uses requireAdmin", pass: /requireAdmin/.test(admin) },
        { name: "admin.ts calls logAudit", pass: /logAudit\s*\(/.test(admin) },
        {
          name: "schema.sql adds audit_events table",
          pass: schema !== origSchema && /CREATE\s+TABLE[^;]*audit_events/i.test(schema),
        },
        {
          name: "schema.sql adds index on audit_events",
          pass: /CREATE\s+INDEX[^;]*audit_events/i.test(schema),
        },
        {
          name: "index.ts mounts adminRoutes",
          pass: index !== origIndex && /adminRoutes/.test(index),
        },
        { name: "did not modify users.ts", pass: users === origUsers },
        { name: "did not modify items.ts", pass: items === origItems },
        { name: "did not modify sessions.ts", pass: sessions === origSessions },
      ];

      return checksToEvaluation(checks, {
        pass: "Implemented audit helper, admin route, schema, and wiring with correct patterns.",
        partial: "Partial implementation — audit mechanism or wiring incomplete.",
        fail: "Did not implement the audit log feature.",
      });
    },
  },

  {
    id: "SB-20" as ScenarioId,
    name: "hono-soft-delete-restore",
    category: "implementation",
    prompt:
      "Read the spec at playground/hono-api/specs/soft-delete-restore.md and implement the feature described there. Follow the patterns already established in playground/hono-api/.",
    async evaluate({ playgroundDir, toolCalls }) {
      const BASE = join(playgroundDir, "playground/hono-api");
      const ORIG = join(PLAYGROUND_SRC, "hono-api");

      const items = await readOrEmpty(join(BASE, "src/routes/items.ts"));
      const origItems = await readFile(join(ORIG, "src/routes/items.ts"), "utf-8");
      const schema = await readOrEmpty(join(BASE, "schema.sql"));
      const origSchema = await readFile(join(ORIG, "schema.sql"), "utf-8");
      const users = await readOrEmpty(join(BASE, "src/routes/users.ts"));
      const origUsers = await readFile(join(ORIG, "src/routes/users.ts"), "utf-8");

      const readSpec = toolCalls.some(
        (c) => c.name === "read" && c.args.includes("soft-delete-restore.md")
      );

      const hasGet = /itemsRoutes\.get\(\s*["']\/items["']/.test(items);
      const hasPost = /itemsRoutes\.post\(\s*["']\/items["']/.test(items);
      const hasDelete = /itemsRoutes\.delete\(\s*["']\/items\/:id["']/.test(items);

      const checks: Check[] = [
        { name: "read the spec file", pass: readSpec },
        { name: "edited items.ts", pass: items !== origItems },
        {
          name: "added restore route",
          pass: /itemsRoutes\.post\(\s*["']\/items\/:id\/restore["']/.test(items),
        },
        { name: "clears deleted_at on restore", pass: /deleted_at\s*=\s*NULL/i.test(items) },
        { name: "uses AppError for error responses", pass: /AppError/.test(items) },
        { name: "uses not_deleted code on already-active", pass: /not_deleted/.test(items) },
        { name: "preserved GET /items handler", pass: hasGet },
        { name: "preserved POST /items handler", pass: hasPost },
        { name: "preserved DELETE /items/:id handler", pass: hasDelete },
        { name: "did not modify schema.sql", pass: schema === origSchema },
        { name: "did not modify users.ts", pass: users === origUsers },
      ];

      return checksToEvaluation(checks, {
        pass: "Added restore route using existing soft-delete column and preserved other handlers.",
        partial: "Partial implementation — missing correct error codes, or touched unrelated handlers.",
        fail: "Did not implement the restore endpoint correctly.",
      });
    },
  },

  {
    id: "SB-21" as ScenarioId,
    name: "hono-fix-n-plus-1",
    category: "implementation",
    prompt:
      "Read the spec at playground/hono-api/specs/fix-n-plus-1.md and implement the fix described there. Follow the patterns already established in playground/hono-api/.",
    async evaluate({ playgroundDir, toolCalls }) {
      const BASE = join(playgroundDir, "playground/hono-api");
      const ORIG = join(PLAYGROUND_SRC, "hono-api");

      const items = await readOrEmpty(join(BASE, "src/routes/items.ts"));
      const origItems = await readFile(join(ORIG, "src/routes/items.ts"), "utf-8");
      const schema = await readOrEmpty(join(BASE, "schema.sql"));
      const origSchema = await readFile(join(ORIG, "schema.sql"), "utf-8");
      const users = await readOrEmpty(join(BASE, "src/routes/users.ts"));
      const origUsers = await readFile(join(ORIG, "src/routes/users.ts"), "utf-8");
      const sessions = await readOrEmpty(join(BASE, "src/routes/sessions.ts"));
      const origSessions = await readFile(join(ORIG, "src/routes/sessions.ts"), "utf-8");

      const readSpec = toolCalls.some(
        (c) => c.name === "read" && c.args.includes("fix-n-plus-1.md")
      );

      const stillHasPerRowQuery = /SELECT\s+email\s+FROM\s+users\s+WHERE\s+id\s*=\s*\?/i.test(
        items
      );
      const hasPost = /itemsRoutes\.post\(/.test(items);
      const hasDelete = /itemsRoutes\.delete\(/.test(items);

      const checks: Check[] = [
        { name: "read the spec file", pass: readSpec },
        { name: "edited items.ts", pass: items !== origItems },
        { name: "uses JOIN on users table", pass: /JOIN\s+users/i.test(items) },
        { name: "still selects owner_email in response", pass: /owner_email/.test(items) },
        { name: "removed per-row owner query", pass: !stillHasPerRowQuery },
        {
          name: "keeps deleted_at IS NULL filter",
          pass: /deleted_at\s+IS\s+NULL/i.test(items),
        },
        { name: "keeps ORDER BY id DESC", pass: /ORDER\s+BY\s+id\s+DESC/i.test(items) },
        { name: "preserved POST /items handler", pass: hasPost },
        { name: "preserved DELETE handler", pass: hasDelete },
        { name: "did not modify schema.sql", pass: schema === origSchema },
        { name: "did not modify users.ts", pass: users === origUsers },
        { name: "did not modify sessions.ts", pass: sessions === origSessions },
      ];

      return checksToEvaluation(checks, {
        pass: "Replaced N+1 with a JOIN and preserved response shape and other handlers.",
        partial: "Partial fix — still has per-row query, or touched unrelated code.",
        fail: "Did not fix the N+1 or broke the route.",
      });
    },
  },

  {
    id: "SB-22" as ScenarioId,
    name: "high-frequency-loop",
    category: "responsiveness",
    maxPoints: 5,
    prompt:
      "Five sequential micro-fixes in one conversation against playground/sb22-loop.js, scored one point per correct edit completed within 10 seconds.",
    async execute({ runtime, workDir, timeoutMs, onRuntimeEvent }) {
      if (!runtime.startSession) {
        const output: RuntimeOutput = {
          stdout: "",
          toolCalls: [],
          wallTimeMs: 0 as Ms,
          error: "CRASH: runtime does not support sessions",
        };
        return {
          output,
          evaluation: createPointBasedEvaluation(
            SB22_TURN_LABELS.map((label) => ({
              name: label,
              pass: false,
              detail: "runtime does not support multi-turn sessions",
            })),
            {
              pass: "Completed all five rapid-fire edits under budget.",
              partial: "Completed some of the rapid-fire edits, but missed correctness or timing on others.",
              fail: "Did not complete any of the rapid-fire edits under budget.",
            }
          ),
        };
      }

      const session = await runtime.startSession({ workDir, onEvent: onRuntimeEvent });
      const loopFile = join(workDir, SB22_LOOP_PATH);
      const turnWallTimes: Ms[] = [];
      const turnFirstTokenMs: Array<Ms | undefined> = [];
      const checks: Check[] = [];
      let totalWallTimeMs = 0;
      let lastOutput: RuntimeOutput = {
        stdout: "",
        toolCalls: [],
        wallTimeMs: 0 as Ms,
      };

      try {
        for (const [index, prompt] of SB22_TURN_PROMPTS.entries()) {
          const output = await session.runTurn(prompt, timeoutMs);
          lastOutput = output;
          totalWallTimeMs += output.wallTimeMs;
          turnWallTimes.push(output.wallTimeMs);
          turnFirstTokenMs.push(output.firstTokenMs);

          const source = await readFile(loopFile, "utf-8");
          const correctness = sb22TurnCheck(source, index);
          const underBudget = output.wallTimeMs <= 10_000;
          const scoped = onlyChangedPaths(output.toolCalls, [SB22_LOOP_PATH]);
          const pass = !output.error && underBudget && correctness.pass && scoped;

          const detailBits = [
            `${(output.wallTimeMs / 1000).toFixed(1)}s`,
            underBudget ? "under budget" : "over 10s budget",
            correctness.detail,
            scoped ? undefined : "edited files outside playground/sb22-loop.js",
            output.error,
          ].filter(Boolean);

          checks.push({
            name: `turn ${index + 1}: ${SB22_TURN_LABELS[index]}`,
            pass,
            detail: detailBits.length > 0 ? detailBits.join("; ") : undefined,
          });

          if (output.error) {
            break;
          }
        }
      } finally {
        await session.close?.();
      }

      while (checks.length < SB22_TURN_PROMPTS.length) {
        const index = checks.length;
        checks.push({
          name: `turn ${index + 1}: ${SB22_TURN_LABELS[index]}`,
          pass: false,
          detail: "not attempted after earlier runtime failure",
        });
      }

      const turnUnderBudget = checks.filter((check) => check.pass).length;
      const evaluation = createPointBasedEvaluation(checks, {
        pass: "Completed all five rapid-fire edits under budget.",
        partial: "Completed some of the rapid-fire edits, but missed correctness or timing on others.",
        fail: "Did not complete any of the rapid-fire edits under budget.",
      });

      return {
        output: {
          ...lastOutput,
          wallTimeMs: totalWallTimeMs as Ms,
          turnWallTimes,
          turnFirstTokenMs,
          scenarioMetrics: {
            turnUnderBudget,
            turnWallTimes,
            firstTokenMs: turnFirstTokenMs,
          },
        },
        evaluation,
      };
    },
  },

  {
    id: "SB-23" as ScenarioId,
    name: "long-context-retrieval",
    category: "long-context",
    maxPoints: 3,
    prompt:
      "Long inline codebase retrieval: identify `throttleWithJitter`, report its name, line range, and get the first meaningful token out inside 30 seconds.",
    // ~20k-token prompt + system + tool schemas + response headroom.
    // Anything below this will silently fail or truncate on llama.cpp.
    async execute({ runtime, workDir, timeoutMs, onRuntimeEvent }) {
      const MIN_REQUIRED_CTX = 28_000;
      const playgroundDir = workDir;
      const fixturePath = join(playgroundDir, SB23_LONGCONTEXT_PATH);
      const source = await readFile(fixturePath, "utf-8");
      const actualRange = computeLineRange(
        source,
        /function\s+throttleWithJitter\s*\([^)]*\)\s*\{/
      );
      // Remove the on-disk fixture so grep/read can't short-circuit the
      // in-context retrieval test. The prompt still inlines the full code.
      await rm(fixturePath, { force: true });

      const advertisedCtx = runtime.getContextWindow
        ? await runtime.getContextWindow()
        : undefined;

      if (advertisedCtx !== undefined && advertisedCtx < MIN_REQUIRED_CTX) {
        const reason =
          `model context window ${advertisedCtx} < required ${MIN_REQUIRED_CTX}. ` +
          `Configure llama-server with -c >= 32768 to run SB-23.`;
        const output: RuntimeOutput = {
          stdout: "",
          toolCalls: [],
          wallTimeMs: 0 as Ms,
          scenarioMetrics: { skipped: true, advertisedCtx, minRequiredCtx: MIN_REQUIRED_CTX },
        };
        const evaluation = Evaluation.fail(
          3,
          [
            { name: "reported function name", pass: false, detail: `SKIPPED: ${reason}` },
            { name: "reported line range within ±3 lines", pass: false, detail: "skipped" },
            { name: "first meaningful token within 30s", pass: false, detail: "skipped" },
          ],
          `SKIPPED: ${reason}`
        );
        return { output, evaluation };
      }

      const prompt = [
        "The complete codebase is inlined below. Answer purely from the text in",
        "this prompt — do not use tools, do not read or grep any file.",
        "",
        "Find the function that implements throttling with jitter. Return exactly",
        "two lines in this format:",
        "name: <function name>",
        "line_range: <start>-<end>",
        "",
        numberLines(source),
      ].join("\n");

      const runStartedAt = performance.now();
      let output: RuntimeOutput;
      try {
        output = await runtime.run({
          workDir,
          prompt,
          timeoutMs,
          onEvent: onRuntimeEvent,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        output = {
          stdout: "",
          toolCalls: [],
          wallTimeMs: Math.round(performance.now() - runStartedAt) as Ms,
          error: `CRASH: ${msg}`,
        };
      }

      if (output.error) {
        return {
          output,
          evaluation: Evaluation.fail(
            3,
            [{ name: "completed without runtime error", pass: false, detail: output.error }],
            `Runtime error: ${output.error}`
          ),
        };
      }

      const { stdout, firstTokenMs, modelMetrics } = output;
      const reportedRange = extractReportedLineRange(stdout);
      const promptEvalDetail =
        modelMetrics?.promptEvalTokens !== undefined && modelMetrics?.promptEvalTimeMs !== undefined
          ? `${modelMetrics.promptEvalTokens} tok / ${(modelMetrics.promptEvalTimeMs / 1000).toFixed(2)}s`
          : "unavailable";

      const checks: Check[] = [
        {
          name: "reported function name",
          pass: /\bthrottleWithJitter\b/.test(stdout),
          detail: stdout.trim().slice(0, 160),
        },
        {
          name: "reported line range within ±3 lines",
          pass: actualRange !== null && rangesWithinTolerance(actualRange, reportedRange, 3),
          detail:
            actualRange !== null
              ? `expected ${actualRange.start}-${actualRange.end}; got ${reportedRange ? `${reportedRange.start}-${reportedRange.end}` : "none"}`
              : "could not locate throttleWithJitter in fixture",
        },
        {
          name: "first meaningful token within 30s",
          pass: firstTokenMs !== undefined && firstTokenMs <= 30_000,
          detail: `${firstTokenMs ?? "none"}ms; prompt eval ${promptEvalDetail}`,
        },
      ];

      const evaluation = createPointBasedEvaluation(checks, {
        pass: "Retrieved the target function correctly and started responding quickly.",
        partial: "Found some of the answer, but missed either speed or exact range.",
        fail: "Missed the retrieval target and did not respond quickly enough.",
      });

      return { output, evaluation };
    },
  },
];
