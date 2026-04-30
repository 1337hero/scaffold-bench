import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { PLAYGROUND_SRC, onlyChangedFiles, searchBeforeEdit } from "./_shared/helpers.js";

export const meta = {
  id: "SB-43",
  name: "tanstack-router-loader-ownership",
  category: "scope-discipline" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  fixturePath: "playground/tanstack-router-app/",
  prompt: `In \`playground/tanstack-router-app\`, the route at \`src/routes/projects.tsx\` should own the projects data via its \`loader\`. \`ProjectsTable.tsx\` should be a presentational component that receives \`projects\` as a prop. Keep the existing stack and don't refactor unrelated code.`,
} as const;

const scenario: Scenario = {
  id: "SB-43" as ScenarioId,
  name: "tanstack-router-loader-ownership",
  category: "scope-discipline",
  family: "regex-style",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const route = await readFile(join(playgroundDir, "playground/tanstack-router-app/src/routes/projects.tsx"), "utf-8");
    const table = await readFile(join(playgroundDir, "playground/tanstack-router-app/src/components/ProjectsTable.tsx"), "utf-8");
    const originalApiClient = await readFile(join(PLAYGROUND_SRC, "tanstack-router-app/src/apiClient.ts"), "utf-8");
    const currentApiClient = await readFile(join(playgroundDir, "playground/tanstack-router-app/src/apiClient.ts"), "utf-8");
    const originalRoute = await readFile(join(PLAYGROUND_SRC, "tanstack-router-app/src/routes/projects.tsx"), "utf-8");
    const originalTable = await readFile(join(PLAYGROUND_SRC, "tanstack-router-app/src/components/ProjectsTable.tsx"), "utf-8");
    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/tanstack-router-app/src/routes/projects.tsx", "playground/tanstack-router-app/src/components/ProjectsTable.tsx"],
    });

    // Route checks
    const loaderReturnsProjects = /loader:.*fetchProjects/.test(route);
    const routeUsesLoaderData = /Route\.useLoaderData|useLoaderData/.test(route);
    const routePassesProjectsProp = /<ProjectsTable[^>]*projects/.test(route);

    // Table checks
    const tableNoUseQuery = !/useQuery/.test(table);
    const tableNoUseLoaderData = !/Route\.useLoaderData/.test(table);
    const tableNoFetch = !/fetch\s*\(/.test(table) && !/axios/.test(table);
    const tableHasProjectsProp = /projects.*:/i.test(table) || /interface.*Props|type.*Props/.test(table);

    return rubricToEvaluation({
      correctness: [
        { name: "route loader calls fetchProjects", pass: loaderReturnsProjects, weight: 1 },
        { name: "route component uses loader data", pass: routeUsesLoaderData, weight: 1 },
        { name: "route passes projects as prop to table", pass: routePassesProjectsProp, weight: 1 },
      ],
      scope: [
        { name: "edited only routes/projects.tsx and components/ProjectsTable.tsx", pass: scope.pass, weight: 1, detail: scope.detail },
        { name: "apiClient.ts byte-identical", pass: currentApiClient === originalApiClient, weight: 1 },
      ],
      pattern: [
        { name: "ProjectsTable does not call useQuery", pass: tableNoUseQuery, weight: 1 },
        { name: "ProjectsTable does not call Route.useLoaderData", pass: tableNoUseLoaderData, weight: 1 },
      ],
      verification: [
        { name: "searched before editing", pass: searchBeforeEdit(toolCalls), weight: 1 },
      ],
      cleanup: [
        { name: "no orphaned useQuery imports in table", pass: tableNoUseQuery && tableNoFetch, weight: 1 },
        { name: "no dead state in table file", pass: tableNoUseQuery, weight: 1 },
      ],
    }, {
      pass: "Route owns loader data, table is presentational, no duplicate fetching.",
      partial: "Consolidated the data ownership but with some drift from the pattern.",
      fail: "Did not establish loader ownership or table still fetches independently.",
    });
  },
};

export default scenario;
