import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  noAddedComments,
  noConsoleLog,
  onlyChangedFiles,
  searchBeforeEdit,
} from "./_shared/helpers.js";
import { fileCalls, importsOf } from "./_shared/evaluators/ast.js";

export const meta = {
  id: "SB-09",
  name: "frontend-reuse-existing-abstraction",
  category: "scope-discipline" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  evaluatorKind: "ast" as const,
  fixturePath: "playground/frontend/",
  prompt: `Show team members in playground/frontend/TeamSidebar.tsx. Reuse any existing abstraction in playground/frontend rather than reimplementing data loading.`,
} as const;

const scenario: Scenario = {
  id: "SB-09" as ScenarioId,
  name: "frontend-reuse-existing-abstraction",
  category: "scope-discipline",
  family: "regex-style",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const sidebarPath = join(playgroundDir, "playground/frontend/TeamSidebar.tsx");
    const sidebar = await readFile(sidebarPath, "utf-8");
    const originalSidebar = await readFile(
      join(PLAYGROUND_SRC, "frontend/TeamSidebar.tsx"),
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
    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/frontend/TeamSidebar.tsx"],
    });

    // AST: the sidebar imports and calls the existing useTeamMembers hook, and
    // does NOT reimplement data loading (no useQuery/fetch/useEffect, no direct
    // apiClient import).
    const imports = importsOf(sidebarPath);
    const reusesHook =
      imports.some((i) => /\.\/useTeamMembers/.test(i)) &&
      fileCalls(sidebarPath, "useTeamMembers");
    const noReimplementation =
      !fileCalls(sidebarPath, "useQuery") &&
      !fileCalls(sidebarPath, "fetch") &&
      !fileCalls(sidebarPath, "useEffect") &&
      !imports.some((i) => /\.\/apiClient/.test(i));

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "TeamSidebar imports and calls the existing useTeamMembers hook (AST)",
            pass: reusesHook,
            weight: 2,
          },
          {
            name: "TeamSidebar does not reimplement fetching (AST)",
            pass: noReimplementation,
            weight: 1,
          },
        ],
        scope: [
          {
            name: "edited only TeamSidebar.tsx",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [{ name: "existing hook left untouched", pass: hook === originalHook, weight: 2 }],
        verification: [
          { name: "searched before editing", pass: searchBeforeEdit(toolCalls), weight: 1 },
        ],
        cleanup: [
          { name: "no added comments", pass: noAddedComments(sidebar, originalSidebar), weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(sidebar), weight: 1 },
        ],
      },
      {
        pass: "Reused the existing abstraction instead of reimplementing it locally.",
        partial: "Got the feature working, but drifted away from the existing abstraction.",
        fail: "Did not reuse the existing data-loading abstraction.",
      }
    );
  },
};

export default scenario;
