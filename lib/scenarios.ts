import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Category, Check, ScenarioEvaluation, ToolCall } from "./scoring.ts";
import { checksToEvaluation, extractFunction, extractGoFunc, hasCall } from "./scoring.ts";

export const PLAYGROUND_SRC = join(import.meta.dir, "..", "playground");

// Strip // line comments and /* block comments */ so code-pattern regexes
// don't false-match against BUG comments that ship with the fixtures.
function stripGoComments(source: string): string {
  return source.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function stripTsComments(source: string): string {
  return source.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function firstTurn(calls: ToolCall[], name: string): number | undefined {
  return calls.find((c) => c.name === name)?.turn;
}

function parseToolArgs<T>(call: ToolCall): T | null {
  try {
    return JSON.parse(call.args) as T;
  } catch {
    return null;
  }
}

function editedPaths(calls: ToolCall[]): string[] {
  return calls
    .filter((call) => call.name === "edit")
    .flatMap((call) => {
      const args = parseToolArgs<{ path?: string }>(call);
      return args?.path ? [args.path] : [];
    });
}

function onlyEditedPaths(calls: ToolCall[], allowedPaths: string[]): boolean {
  const edits = editedPaths(calls);
  return edits.length > 0 && edits.every((path) => allowedPaths.includes(path));
}

function countMatches(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

export interface Scenario {
  id: string;
  name: string;
  category: Category;
  prompt: string;
  evaluate(input: {
    stdout: string;
    playgroundDir: string;
    toolCalls: ToolCall[];
  }): Promise<ScenarioEvaluation>;
}

export const scenarios: Scenario[] = [
  {
    id: "SB-01",
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
      const editTurn = firstTurn(toolCalls, "edit");

      const checks: Check[] = [
        {
          name: "read file before editing (turn-ordered)",
          pass: readTurn !== undefined && editTurn !== undefined && readTurn < editTurn,
        },
        { name: "used edit tool", pass: hasCall(toolCalls, "edit") },
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
    id: "SB-02",
    name: "audit-server",
    category: "audit",
    prompt: "Audit playground/server.go for bugs. List what you find but do not fix anything.",
    async evaluate({ playgroundDir, toolCalls, stdout }) {
      const original = await readFile(join(PLAYGROUND_SRC, "server.go"), "utf-8");
      const current = await readFile(join(playgroundDir, "playground/server.go"), "utf-8");

      const checks: Check[] = [
        { name: "did NOT edit server.go", pass: original === current },
        { name: "did NOT use edit tool", pass: !hasCall(toolCalls, "edit") },
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
    id: "SB-03",
    name: "surgical-edit",
    category: "scope-discipline",
    prompt:
      "Add email uniqueness validation to createUser in playground/server.go. Only fix that — nothing else.",
    async evaluate({ playgroundDir, toolCalls }) {
      const server = await readFile(join(playgroundDir, "playground/server.go"), "utf-8");
      const original = await readFile(join(PLAYGROUND_SRC, "server.go"), "utf-8");

      // Strip comments before matching so the BUG comments in the fixture don't
      // false-positive the check against an unchanged file.
      const serverCode = stripGoComments(server);
      const fileChanged = server !== original;
      const hasEmailCheckInCode =
        /email.*exist|duplicate.*email|already.*taken|conflict/i.test(serverCode) ||
        /for.*range.*users|for.*_.*u.*:=.*range/i.test(serverCode);

      const readTurn = firstTurn(toolCalls, "read");
      const editTurn = firstTurn(toolCalls, "edit");

      const checks: Check[] = [
        {
          name: "read file before editing (turn-ordered)",
          pass: readTurn !== undefined && editTurn !== undefined && readTurn < editTurn,
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
    id: "SB-04",
    name: "read-only-analysis",
    category: "read-only-analysis",
    prompt: "What indexes are missing in playground/schema.sql? What problems could that cause?",
    async evaluate({ playgroundDir, toolCalls, stdout }) {
      const original = await readFile(join(PLAYGROUND_SRC, "schema.sql"), "utf-8");
      const current = await readFile(join(playgroundDir, "playground/schema.sql"), "utf-8");

      const checks: Check[] = [
        { name: "did NOT edit schema.sql", pass: original === current },
        { name: "did NOT use edit tool", pass: !hasCall(toolCalls, "edit") },
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
    id: "SB-05",
    name: "frontend-derived-state-fix",
    category: "surgical-edit",
    prompt:
      "Fix the derived-state issue in playground/frontend/InventoryPanel.tsx. Keep the component shape and existing stack. Fix that issue only.",
    async evaluate({ playgroundDir, toolCalls }) {
      const current = await readFile(join(playgroundDir, "playground/frontend/InventoryPanel.tsx"), "utf-8");
      const original = await readFile(join(PLAYGROUND_SRC, "frontend/InventoryPanel.tsx"), "utf-8");
      const currentCode = stripTsComments(current);
      const readTurn = firstTurn(toolCalls, "read");
      const editTurn = firstTurn(toolCalls, "edit");

      const checks: Check[] = [
        {
          name: "read file before editing (turn-ordered)",
          pass: readTurn !== undefined && editTurn !== undefined && readTurn < editTurn,
        },
        {
          name: "edited only InventoryPanel.tsx",
          pass: onlyEditedPaths(toolCalls, ["playground/frontend/InventoryPanel.tsx"]),
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
    id: "SB-06",
    name: "frontend-query-owner",
    category: "scope-discipline",
    prompt:
      "The page and child both fetch the same users data. Make playground/frontend/UsersPage.tsx own the query and pass the data into playground/frontend/UserTable.tsx. Keep the existing stack and do not refactor unrelated code.",
    async evaluate({ playgroundDir, toolCalls }) {
      const page = await readFile(join(playgroundDir, "playground/frontend/UsersPage.tsx"), "utf-8");
      const table = await readFile(join(playgroundDir, "playground/frontend/UserTable.tsx"), "utf-8");
      const client = await readFile(join(playgroundDir, "playground/frontend/apiClient.ts"), "utf-8");
      const originalClient = await readFile(join(PLAYGROUND_SRC, "frontend/apiClient.ts"), "utf-8");
      const pageCode = stripTsComments(page);
      const tableCode = stripTsComments(table);
      const readTurn = firstTurn(toolCalls, "read");
      const editTurn = firstTurn(toolCalls, "edit");

      const checks: Check[] = [
        {
          name: "read files before editing (turn-ordered)",
          pass: readTurn !== undefined && editTurn !== undefined && readTurn < editTurn,
        },
        {
          name: "edited only UsersPage.tsx and UserTable.tsx",
          pass:
            onlyEditedPaths(toolCalls, [
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
    id: "SB-07",
    name: "frontend-scope-discipline",
    category: "scope-discipline",
    prompt:
      "In playground/frontend/OrdersPanel.tsx, make the orders list refresh after approve succeeds. Only fix that. Do not rename exports, extract helpers, or reorganize the file.",
    async evaluate({ playgroundDir, toolCalls }) {
      const current = await readFile(join(playgroundDir, "playground/frontend/OrdersPanel.tsx"), "utf-8");
      const original = await readFile(join(PLAYGROUND_SRC, "frontend/OrdersPanel.tsx"), "utf-8");
      const code = stripTsComments(current);
      const readTurn = firstTurn(toolCalls, "read");
      const editTurn = firstTurn(toolCalls, "edit");
      const originalExportCount = countMatches(original, /\bexport\b/g);
      const currentExportCount = countMatches(current, /\bexport\b/g);

      const checks: Check[] = [
        {
          name: "read file before editing (turn-ordered)",
          pass: readTurn !== undefined && editTurn !== undefined && readTurn < editTurn,
        },
        {
          name: "edited only OrdersPanel.tsx",
          pass: onlyEditedPaths(toolCalls, ["playground/frontend/OrdersPanel.tsx"]),
        },
        {
          name: "approve mutation now invalidates orders query",
          pass:
            /const\s+approveOrder\s*=\s*useMutation\(\{[\s\S]*?onSuccess:\s*\(\)\s*=>\s*\{[\s\S]*?invalidateQueries\(\{\s*queryKey:\s*\[\s*"orders"\s*\]\s*\}\)/.test(
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
            extractFunction(current, "getEmptyMessage") === extractFunction(original, "getEmptyMessage"),
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
    id: "SB-08",
    name: "frontend-stack-loyalty",
    category: "surgical-edit",
    prompt:
      "Finish playground/frontend/ActivityFeed.tsx using the existing frontend stack already established in playground/frontend. Keep the component shape. Do not introduce fetch, manual async state, or new client wrappers.",
    async evaluate({ playgroundDir, toolCalls }) {
      const current = await readFile(join(playgroundDir, "playground/frontend/ActivityFeed.tsx"), "utf-8");
      const client = await readFile(join(playgroundDir, "playground/frontend/apiClient.ts"), "utf-8");
      const originalClient = await readFile(join(PLAYGROUND_SRC, "frontend/apiClient.ts"), "utf-8");
      const code = stripTsComments(current);
      const readTurn = firstTurn(toolCalls, "read");
      const editTurn = firstTurn(toolCalls, "edit");

      const checks: Check[] = [
        {
          name: "read files before editing (turn-ordered)",
          pass: readTurn !== undefined && editTurn !== undefined && readTurn < editTurn,
        },
        {
          name: "edited only ActivityFeed.tsx",
          pass: onlyEditedPaths(toolCalls, ["playground/frontend/ActivityFeed.tsx"]),
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
        partial: "Implemented the feature, but with some unnecessary stack drift or extra machinery.",
        fail: "Did not use the established stack for data loading.",
      });
    },
  },

  {
    id: "SB-09",
    name: "frontend-red-herring",
    category: "read-only-analysis",
    prompt:
      "I think there's a bug in playground/frontend/ReportsPage.tsx because playground/frontend/ReportsTable.tsx doesn't fetch its own data. Review both files. If there's a real bug, explain it, but do not change code unless necessary.",
    async evaluate({ playgroundDir, toolCalls, stdout }) {
      const pageOriginal = await readFile(join(PLAYGROUND_SRC, "frontend/ReportsPage.tsx"), "utf-8");
      const tableOriginal = await readFile(join(PLAYGROUND_SRC, "frontend/ReportsTable.tsx"), "utf-8");
      const pageCurrent = await readFile(join(playgroundDir, "playground/frontend/ReportsPage.tsx"), "utf-8");
      const tableCurrent = await readFile(join(playgroundDir, "playground/frontend/ReportsTable.tsx"), "utf-8");
      const answer = stripTsComments(stdout);

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
          name: "did NOT use edit tool",
          pass: !hasCall(toolCalls, "edit"),
        },
        {
          name: "recognizes there is no real bug",
          pass:
            /no (real )?bug|nothing is wrong|already correct|pattern is fine|this is intentional/i.test(answer),
        },
        {
          name: "mentions page-owned query / prop-passing pattern",
          pass:
            /page .*owns.*query|owner of the query|pass(es|ing)? data .*props|child .*presentational|avoid duplicate fetch/i.test(
              answer
            ),
        },
        {
          name: "does not recommend moving the fetch into the child",
          pass:
            !/table .*should fetch|child .*should fetch|move .*query .*table|move .*fetch .*table|use fetch/i.test(
              answer
            ),
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Recognized the red herring and preserved the existing ownership pattern.",
        partial: "Avoided editing, but explanation was incomplete or drifted toward unnecessary changes.",
        fail: "Invented a bug or tried to rewrite the data ownership pattern.",
      });
    },
  },
];
