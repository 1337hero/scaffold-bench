import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  firstChangeTurn,
  firstTurn,
  onlyChangedFiles,
  stripComments,
} from "./_shared/helpers.js";
import { componentUsesHook, importsOf } from "./_shared/evaluators/ast.js";

export const meta = {
  id: "SB-03",
  name: "frontend-query-owner",
  category: "scope-discipline" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  evaluatorKind: "ast" as const,
  fixturePath: "playground/frontend/",
  prompt: `The page and child both fetch the same users data. Make playground/frontend/UsersPage.tsx own the query and pass the data into playground/frontend/UserTable.tsx. Keep the existing stack and do not refactor unrelated code.`,
} as const;

const scenario: Scenario = {
  id: "SB-03" as ScenarioId,
  name: "frontend-query-owner",
  category: "scope-discipline",
  family: "regex-style",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const pagePath = join(playgroundDir, "playground/frontend/UsersPage.tsx");
    const tablePath = join(playgroundDir, "playground/frontend/UserTable.tsx");
    const page = await readFile(pagePath, "utf-8");
    const table = await readFile(tablePath, "utf-8");
    const client = await readFile(join(playgroundDir, "playground/frontend/apiClient.ts"), "utf-8");
    const originalClient = await readFile(join(PLAYGROUND_SRC, "frontend/apiClient.ts"), "utf-8");
    const pageCode = stripComments(page);
    const tableCode = stripComments(table);
    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);
    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/frontend/UsersPage.tsx", "playground/frontend/UserTable.tsx"],
    });

    // AST: the page component owns the query hook and passes the data down; the
    // child is presentational (no query hook, no react-query import).
    const pageOwnsQuery = componentUsesHook(pagePath, "UsersPage", "useQuery");
    const passesUsersDown = /<UserTable[\s\S]*?=\{users\}/.test(pageCode);
    const childPresentational =
      !componentUsesHook(tablePath, "UserTable", "useQuery") &&
      !importsOf(tablePath).some((i) => /@tanstack\/react-query/.test(i));

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "page component owns the users query and passes data down (AST)",
            pass: pageOwnsQuery && passesUsersDown,
            weight: 2,
          },
          {
            name: "child is presentational: no query hook or react-query import (AST)",
            pass: childPresentational,
            weight: 1,
          },
        ],
        scope: [
          {
            name: "edited only UsersPage.tsx and UserTable.tsx",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "page still handles loading and error states",
            pass:
              /if\s*\(\s*isLoading\s*\)/.test(pageCode) && /if\s*\(\s*error\s*\)/.test(pageCode),
            weight: 1,
          },
          {
            name: "existing api client left untouched",
            pass: client === originalClient,
            weight: 1,
          },
        ],
        verification: [
          {
            name: "read files before changing them (turn-ordered)",
            pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
            weight: 1,
          },
        ],
        cleanup: [
          {
            name: "did not swap in a different request client",
            pass: !/fetch\s*\(/.test(pageCode) && !/\baxios\b/.test(`${pageCode}\n${tableCode}`),
            weight: 1,
          },
          {
            name: "table has no query/client imports",
            pass:
              !/from\s+["']@tanstack\/react-query["']/.test(table) &&
              !/from\s+["']\.\/apiClient["']/.test(table),
            weight: 1,
          },
        ],
      },
      {
        pass: "Moved query ownership to the page and kept the existing stack intact.",
        partial: "Consolidated the query, but introduced some unnecessary drift.",
        fail: "Did not establish a single query owner or changed the stack.",
      }
    );
  },
};

export default scenario;
