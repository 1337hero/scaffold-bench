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
  searchBeforeEdit,
} from "./_shared/helpers.js";

export const meta = {
  id: "SB-40",
  name: "nextjs-server-client-boundary",
  category: "surgical-edit" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  fixturePath: "playground/nextjs-app/",
  prompt: `The dashboard filters component fails to build. Fix it with the smallest correct change. Do not refactor.`,
} as const;

const scenario: Scenario = {
  id: "SB-40" as ScenarioId,
  name: "nextjs-server-client-boundary",
  category: "surgical-edit",
  family: "regex-style",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const filters = await readFile(
      join(playgroundDir, "playground/nextjs-app/app/dashboard/DashboardFilters.tsx"),
      "utf-8"
    );
    const originalFilters = await readFile(
      join(PLAYGROUND_SRC, "nextjs-app/app/dashboard/DashboardFilters.tsx"),
      "utf-8"
    );
    const settingsPage = await readFile(
      join(playgroundDir, "playground/nextjs-app/app/settings/page.tsx"),
      "utf-8"
    );
    const originalSettingsPage = await readFile(
      join(PLAYGROUND_SRC, "nextjs-app/app/settings/page.tsx"),
      "utf-8"
    );
    const dashboardPage = await readFile(
      join(playgroundDir, "playground/nextjs-app/app/dashboard/page.tsx"),
      "utf-8"
    );
    const originalDashboardPage = await readFile(
      join(PLAYGROUND_SRC, "nextjs-app/app/dashboard/page.tsx"),
      "utf-8"
    );
    const layoutPage = await readFile(
      join(playgroundDir, "playground/nextjs-app/app/layout.tsx"),
      "utf-8"
    );
    const originalLayoutPage = await readFile(
      join(PLAYGROUND_SRC, "nextjs-app/app/layout.tsx"),
      "utf-8"
    );

    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);
    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/nextjs-app/app/dashboard/DashboardFilters.tsx"],
    });

    const hasUseClientDirective = /^["']use client["'];?\s*$/m.test(filters.trimStart());
    const hasUseServer = /["']use server["']/.test(filters);
    const useStateStillPresent = /import\s*\{[^}]*useState[^}]*\}\s*from\s*["']react["']/.test(
      filters
    );
    const onClickStillPresent = /onClick/.test(filters);

    return rubricToEvaluation(
      {
        correctness: [
          { name: "file was changed", pass: filters !== originalFilters, weight: 1 },
          {
            name: '"use client" directive added as first line',
            pass: hasUseClientDirective,
            weight: 2,
          },
        ],
        scope: [
          {
            name: "edited only DashboardFilters.tsx",
            pass: scope.pass,
            weight: 1,
            detail: scope.detail,
          },
          {
            name: "settings/page.tsx untouched (red herring)",
            pass: settingsPage === originalSettingsPage,
            weight: 1,
          },
        ],
        pattern: [
          { name: "useState import unchanged", pass: useStateStillPresent, weight: 1 },
          { name: "onClick handler unchanged", pass: onClickStillPresent, weight: 1 },
        ],
        verification: [
          {
            name: "searched before editing",
            pass:
              searchBeforeEdit(toolCalls) ||
              (readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn),
            weight: 1,
          },
        ],
        cleanup: [
          { name: 'no "use server" directive added', pass: !hasUseServer, weight: 1 },
          {
            name: "other app files untouched",
            pass: dashboardPage === originalDashboardPage && layoutPage === originalLayoutPage,
            weight: 1,
          },
        ],
      },
      {
        pass: "Added 'use client' directive at the top of the right file, nothing else touched.",
        partial: "Directive added but file reorganized, OR added to wrong file.",
        fail: "Refactored, wrapped in dynamic import, or didn't add the directive.",
      }
    );
  },
};

export default scenario;
