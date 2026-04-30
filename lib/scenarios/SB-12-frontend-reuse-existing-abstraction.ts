import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { checksToEvaluation } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import {
  PLAYGROUND_SRC,
  onlyChangedFiles,
  searchBeforeEdit,
  stripComments,
} from "./_shared/helpers.js";

export const meta = {
  id: "SB-12",
  name: "frontend-reuse-existing-abstraction",
  category: "scope-discipline" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  fixturePath: "playground/frontend/",
  prompt: `Show team members in playground/frontend/TeamSidebar.tsx. Reuse any existing abstraction in playground/frontend rather than reimplementing data loading.`,
} as const;

const scenario: Scenario = {
  id: "SB-12" as ScenarioId,
  name: "frontend-reuse-existing-abstraction",
  category: "scope-discipline",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const sidebar = await readFile(
      join(playgroundDir, "playground/frontend/TeamSidebar.tsx"),
      "utf-8"
    );
    const hook = await readFile(
      join(playgroundDir, "playground/frontend/useTeamMembers.ts"),
      "utf-8"
    );
    const originalHook = await readFile(join(PLAYGROUND_SRC, "frontend/useTeamMembers.ts"), "utf-8");
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
};

export default scenario;
