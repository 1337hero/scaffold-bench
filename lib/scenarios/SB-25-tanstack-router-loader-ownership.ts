import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  bunAvailable,
  noConsoleLog,
  onlyChangedFiles,
  searchBeforeEdit,
} from "./_shared/helpers.js";
import {
  componentUsesHook,
  fileCalls,
  runBunTest,
  runHiddenTests,
} from "./_shared/evaluators/index.js";

const APP = "playground/tanstack-router-app";

export const meta = {
  id: "SB-25",
  name: "tanstack-router-loader-ownership",
  category: "scope-discipline" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/tanstack-router-app/",
  prompt: `In \`playground/tanstack-router-app\`, the route at \`src/routes/projects.tsx\` should own the projects data via its \`loader\`. \`ProjectsTable.tsx\` should be a presentational component that receives \`projects\` as a prop. Keep the existing stack and don't refactor unrelated code.`,
} as const;

const scenario: Scenario = {
  id: "SB-25" as ScenarioId,
  name: "tanstack-router-loader-ownership",
  category: "scope-discipline",
  family: "regex-style",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, APP);
    const routePath = join(fixtureDir, "src/routes/projects.tsx");
    const tablePath = join(fixtureDir, "src/components/ProjectsTable.tsx");
    const route = await readFile(routePath, "utf-8");
    const table = await readFile(tablePath, "utf-8");
    const originalApiClient = await readFile(
      join(PLAYGROUND_SRC, "tanstack-router-app/src/apiClient.ts"),
      "utf-8"
    );
    const currentApiClient = await readFile(join(fixtureDir, "src/apiClient.ts"), "utf-8");
    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [`${APP}/src/routes/projects.tsx`, `${APP}/src/components/ProjectsTable.tsx`],
    });

    // AST: ownership moved off the table — it no longer fetches its own data.
    const tableNoUseQuery = !componentUsesHook(tablePath, "ProjectsTable", "useQuery");
    const tableNoFetch =
      !fileCalls(tablePath, "fetch") &&
      !componentUsesHook(tablePath, "ProjectsTable", "useLoaderData") &&
      !/axios/.test(table);
    const tableHasProjectsProp = /projects\s*[:}]/.test(table) || /Props/.test(table);

    // Structure: route loader owns the fetch and feeds the table.
    const loaderCallsFetch = /loader\s*:[\s\S]*?fetchProjects/.test(route);
    const routeUsesLoaderData = /useLoaderData/.test(route);
    const routePassesProjects = /<ProjectsTable[^>]*projects/.test(route);

    // Behavioral: the data source the loader owns fetches exactly once.
    const fetchTest = bunAvailable()
      ? await runBunTest(fixtureDir, "src/apiClient.test.ts")
      : { pass: false, stdout: "", stderr: "bun unavailable" };
    const hidden = await runHiddenTests("SB-25", fixtureDir);
    const fetchesOnce = fetchTest.pass && hidden.total > 0 && hidden.rate === 1;

    return rubricToEvaluation(
      {
        correctness: [
          { name: "route loader calls fetchProjects", pass: loaderCallsFetch, weight: 1 },
          {
            name: "route uses loader data and passes projects to table",
            pass: routeUsesLoaderData && routePassesProjects,
            weight: 1,
          },
          {
            name: "loader data source fetches exactly once (behavioral)",
            pass: fetchesOnce && tableNoUseQuery && tableNoFetch,
            weight: 1,
            detail: fetchesOnce ? undefined : fetchTest.stdout + "\n" + fetchTest.stderr,
          },
        ],
        scope: [
          {
            name: "edited only routes/projects.tsx and components/ProjectsTable.tsx",
            pass: scope.pass,
            weight: 1,
            detail: scope.detail,
          },
          {
            name: "apiClient.ts byte-identical",
            pass: currentApiClient === originalApiClient,
            weight: 1,
          },
        ],
        pattern: [
          { name: "ProjectsTable does not call useQuery (AST)", pass: tableNoUseQuery, weight: 1 },
          {
            name: "ProjectsTable receives projects as a prop, not loader data",
            pass: tableHasProjectsProp && tableNoFetch,
            weight: 1,
          },
        ],
        verification: [
          { name: "searched before editing", pass: searchBeforeEdit(toolCalls), weight: 1 },
        ],
        cleanup: [
          {
            name: "no orphaned useQuery / fetch in table",
            pass: tableNoUseQuery && !fileCalls(tablePath, "fetch"),
            weight: 1,
          },
          { name: "no console.log added in table", pass: noConsoleLog(table), weight: 1 },
        ],
      },
      {
        pass: "Route owns loader data, table is presentational, single fetch — no duplication.",
        partial: "Consolidated ownership but with drift from the loader/presentational pattern.",
        fail: "Did not establish loader ownership or the table still fetches independently.",
      }
    );
  },
};

export default scenario;
