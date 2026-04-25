import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { checksToEvaluation, extractFunction, hasCall } from "../scoring.ts";
import type { Scenario } from "./types.js";
import {
  PLAYGROUND_SRC,
  countMatches,
  firstChangeTurn,
  firstTurn,
  noFilesChanged,
  onlyChangedFiles,
  readTurnsForPath,
  searchBeforeEdit,
  stripComments,
} from "./helpers.js";

export const frontendScenarios: Scenario[] = [
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
      const scope = await onlyChangedFiles({
        playgroundDir,
        allowedPaths: ["playground/frontend/InventoryPanel.tsx"],
      });

      const checks = [
        {
          name: "read file before changing it (turn-ordered)",
          pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
        },
        {
          name: "edited only InventoryPanel.tsx",
          pass: scope.pass,
          detail: scope.detail,
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
      const scope = await onlyChangedFiles({
        playgroundDir,
        allowedPaths: ["playground/frontend/UsersPage.tsx", "playground/frontend/UserTable.tsx"],
      });

      const checks = [
        {
          name: "read files before changing them (turn-ordered)",
          pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
        },
        {
          name: "edited only UsersPage.tsx and UserTable.tsx",
          pass: scope.pass,
          detail: scope.detail,
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
      const scope = await onlyChangedFiles({
        playgroundDir,
        allowedPaths: ["playground/frontend/OrdersPanel.tsx"],
      });

      const checks = [
        {
          name: "read file before changing it (turn-ordered)",
          pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
        },
        {
          name: "edited only OrdersPanel.tsx",
          pass: scope.pass,
          detail: scope.detail,
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
      const scope = await onlyChangedFiles({
        playgroundDir,
        allowedPaths: ["playground/frontend/ActivityFeed.tsx"],
      });

      const checks = [
        {
          name: "read files before changing them (turn-ordered)",
          pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
        },
        {
          name: "edited only ActivityFeed.tsx",
          pass: scope.pass,
          detail: scope.detail,
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
      const scope = await noFilesChanged({ playgroundDir });

      const checks = [
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
        { name: "did not change any files", pass: scope.pass, detail: scope.detail },
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
      const scope = await noFilesChanged({ playgroundDir });

      const checks = [
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
        { name: "did not change any files", pass: scope.pass, detail: scope.detail },
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
      const scope = await onlyChangedFiles({
        playgroundDir,
        allowedPaths: ["playground/frontend/currency.ts"],
      });

      const checks = [
        {
          name: "searched before editing",
          pass: searchBeforeEdit(toolCalls),
        },
        {
          name: "read before changing files (turn-ordered)",
          pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
        },
        {
          name: "edited only currency.ts",
          pass: scope.pass,
          detail: scope.detail,
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
      const scope = await onlyChangedFiles({
        playgroundDir,
        allowedPaths: ["playground/frontend/TeamSidebar.tsx"],
      });

      const checks = [
        {
          name: "searched before editing",
          pass: searchBeforeEdit(toolCalls),
        },
        {
          name: "edited only TeamSidebar.tsx",
          pass: scope.pass,
          detail: scope.detail,
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
];
