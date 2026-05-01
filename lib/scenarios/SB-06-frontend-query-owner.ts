import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { PLAYGROUND_SRC, firstChangeTurn, firstTurn, onlyChangedFiles, stripComments } from "./_shared/helpers.js";

export const meta = {
  id: "SB-06",
  name: "frontend-query-owner",
  category: "scope-discipline" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  fixturePath: "playground/frontend/",
  prompt: `The page and child both fetch the same users data. Make playground/frontend/UsersPage.tsx own the query and pass the data into playground/frontend/UserTable.tsx. Keep the existing stack and do not refactor unrelated code.`,
} as const;

const scenario: Scenario = {
  id: "SB-06" as ScenarioId,
  name: "frontend-query-owner",
  category: "scope-discipline",
  family: "regex-style",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const page = await readFile(join(playgroundDir, "playground/frontend/UsersPage.tsx"), "utf-8");
    const table = await readFile(join(playgroundDir, "playground/frontend/UserTable.tsx"), "utf-8");
    const client = await readFile(join(playgroundDir, "playground/frontend/apiClient.ts"), "utf-8");
    const originalClient = await readFile(join(PLAYGROUND_SRC, "frontend/apiClient.ts"), "utf-8");
    const pageCode = stripComments(page);
    const tableCode = stripComments(table);
    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);
    const scope = await onlyChangedFiles({ playgroundDir, allowedPaths: ["playground/frontend/UsersPage.tsx", "playground/frontend/UserTable.tsx"] });

    return rubricToEvaluation({
      correctness: [
        { name: "page owns the users query", pass: /useQuery\s*\(/.test(pageCode) && /queryKey:\s*\[\s*"users"\s*\]/.test(pageCode) && /<UserTable[\s\S]*?=\{users\}/.test(pageCode), weight: 2 },
        { name: "child no longer fetches users", pass: !/useQuery\s*\(/.test(tableCode) && !/api\.get\s*(?:<[\s\S]*?>)?\s*\(\s*["'`]\/users["'`]/.test(tableCode) && !/fetch\s*\(/.test(tableCode) && !/\baxios\b/.test(tableCode), weight: 1 },
      ],
      scope: [
        { name: "edited only UsersPage.tsx and UserTable.tsx", pass: scope.pass, weight: 2, detail: scope.detail },
      ],
      pattern: [
        { name: "page still handles loading and error states", pass: /if\s*\(\s*isLoading\s*\)/.test(pageCode) && /if\s*\(\s*error\s*\)/.test(pageCode), weight: 1 },
        { name: "existing api client left untouched", pass: client === originalClient, weight: 1 },
      ],
      verification: [
        { name: "read files before changing them (turn-ordered)", pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn, weight: 1 },
      ],
      cleanup: [
        { name: "did not swap in a different request client", pass: !/fetch\s*\(/.test(pageCode) && !/\baxios\b/.test(`${pageCode}\n${tableCode}`), weight: 1 },
        { name: "table has no query/client imports", pass: !/from\s+["']@tanstack\/react-query["']/.test(table) && !/from\s+["']\.\/apiClient["']/.test(table), weight: 1 },
      ],
    }, {
      pass: "Moved query ownership to the page and kept the existing stack intact.",
      partial: "Consolidated the query, but introduced some unnecessary drift.",
      fail: "Did not establish a single query owner or changed the stack.",
    });
  },
};

export default scenario;
