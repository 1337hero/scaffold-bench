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

function changedPaths(calls: ToolCall[]): string[] {
  return calls
    .filter((call) => call.name === "edit" || call.name === "write")
    .flatMap((call) => {
      const args = parseToolArgs<{ path?: string }>(call);
      return args?.path ? [args.path] : [];
    });
}

function onlyChangedPaths(calls: ToolCall[], allowedPaths: string[]): boolean {
  const changes = changedPaths(calls);
  return changes.length > 0 && changes.every((path) => allowedPaths.includes(path));
}

function countMatches(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

function hasCallAfter(calls: ToolCall[], targetName: string, afterTurn: number): boolean {
  return calls.some((call) => call.name === targetName && call.turn > afterTurn);
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
      const args = parseToolArgs<{ path?: string }>(call);
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

function bashCommands(calls: ToolCall[]): string[] {
  return calls
    .filter((call) => call.name === "bash")
    .flatMap((call) => {
      const args = parseToolArgs<{ command?: string }>(call);
      return args?.command ? [args.command] : [];
    });
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
      const changeTurn = firstChangeTurn(toolCalls);

      const checks: Check[] = [
        {
          name: "read file before changing it (turn-ordered)",
          pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
        },
        { name: "used edit or write tool", pass: hasCall(toolCalls, "edit") || hasCall(toolCalls, "write") },
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
    id: "SB-04",
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
      const changeTurn = firstChangeTurn(toolCalls);

      const checks: Check[] = [
        {
          name: "read files before changing them (turn-ordered)",
          pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
        },
        {
          name: "edited only UsersPage.tsx and UserTable.tsx",
          pass:
            onlyChangedPaths(toolCalls, [
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
          name: "did NOT use edit or write tool",
          pass: !hasCall(toolCalls, "edit") && !hasCall(toolCalls, "write"),
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

  {
    id: "SB-10",
    name: "frontend-no-op",
    category: "read-only-analysis",
    prompt:
      "Users say the projects list does not refresh after a successful create. Check playground/frontend/ProjectsPanel.tsx and fix it only if there is a real bug.",
    async evaluate({ playgroundDir, toolCalls, stdout }) {
      const original = await readFile(join(PLAYGROUND_SRC, "frontend/ProjectsPanel.tsx"), "utf-8");
      const current = await readFile(join(playgroundDir, "playground/frontend/ProjectsPanel.tsx"), "utf-8");
      const answer = stripTsComments(stdout);

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
          pass:
            /already refresh|already handled|already invalidat|already refetch|no real bug|nothing to fix/i.test(
              answer
            ),
        },
        {
          name: "mentions query invalidation or refetch behavior",
          pass: /invalidateQueries|queryKey:\s*\[\s*"projects"|refresh after create|refetch/i.test(answer),
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
    id: "SB-11",
    name: "frontend-find-the-right-file",
    category: "surgical-edit",
    prompt:
      "Refund amounts render as `$-5.00` instead of `-$5.00` in the invoices UI. Fix the bug with the smallest correct change.",
    async evaluate({ playgroundDir, toolCalls }) {
      const helper = await readFile(join(playgroundDir, "playground/frontend/currency.ts"), "utf-8");
      const helperOriginal = await readFile(join(PLAYGROUND_SRC, "frontend/currency.ts"), "utf-8");
      const invoice = await readFile(join(playgroundDir, "playground/frontend/InvoiceTable.tsx"), "utf-8");
      const invoiceOriginal = await readFile(join(PLAYGROUND_SRC, "frontend/InvoiceTable.tsx"), "utf-8");
      const summary = await readFile(join(playgroundDir, "playground/frontend/RefundSummary.tsx"), "utf-8");
      const summaryOriginal = await readFile(join(PLAYGROUND_SRC, "frontend/RefundSummary.tsx"), "utf-8");
      const helperCode = stripTsComments(helper);
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
            (/Math\.abs\s*\(\s*amount\s*\)/.test(helperCode) || /amount\s*<\s*0/.test(helperCode)) &&
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
    id: "SB-12",
    name: "frontend-reuse-existing-abstraction",
    category: "scope-discipline",
    prompt:
      "Show team members in playground/frontend/TeamSidebar.tsx. Reuse any existing abstraction in playground/frontend rather than reimplementing data loading.",
    async evaluate({ playgroundDir, toolCalls }) {
      const sidebar = await readFile(join(playgroundDir, "playground/frontend/TeamSidebar.tsx"), "utf-8");
      const hook = await readFile(join(playgroundDir, "playground/frontend/useTeamMembers.ts"), "utf-8");
      const originalHook = await readFile(join(PLAYGROUND_SRC, "frontend/useTeamMembers.ts"), "utf-8");
      const sidebarCode = stripTsComments(sidebar);

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
    id: "SB-13",
    name: "verify-and-repair",
    category: "scope-discipline",
    prompt: "Fix calculateSubtotal in playground/cart.mjs and verify the fix.",
    async evaluate({ playgroundDir, toolCalls }) {
      const cart = await readFile(join(playgroundDir, "playground/cart.mjs"), "utf-8");
      const cartOriginal = await readFile(join(PLAYGROUND_SRC, "cart.mjs"), "utf-8");
      const test = await readFile(join(playgroundDir, "playground/cart.test.mjs"), "utf-8");
      const testOriginal = await readFile(join(PLAYGROUND_SRC, "cart.test.mjs"), "utf-8");
      const cartCode = stripTsComments(cart);
      const changeTurn = firstChangeTurn(toolCalls);
      const bashes = bashCommands(toolCalls);

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
          name: "ran a verification command after editing",
          pass:
            changeTurn !== undefined &&
            hasCallAfter(toolCalls, "bash", changeTurn) &&
            bashes.some((command) => /cart\.test\.mjs|bun test|node .*cart\.test\.mjs/.test(command)),
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Fixed the bug and ran a verification command afterward.",
        partial: "Fixed the bug, but skipped verification or changed more than needed.",
        fail: "Did not repair the subtotal logic correctly.",
      });
    },
  },
];
