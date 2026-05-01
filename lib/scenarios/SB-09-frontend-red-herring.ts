import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { hasCall } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  noAddedComments,
  noConsoleLog,
  noFilesChanged,
  stripComments,
} from "./_shared/helpers.js";

export const meta = {
  id: "SB-09",
  name: "frontend-red-herring",
  category: "read-only-analysis" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "stdout" as const,
  fixturePath: "playground/frontend/",
  prompt: `I think there's a bug in playground/frontend/ReportsPage.tsx because playground/frontend/ReportsTable.tsx doesn't fetch its own data. Review both files. If there's a real bug, explain it, but do not change code unless necessary.`,
} as const;

const scenario: Scenario = {
  id: "SB-09" as ScenarioId,
  name: "frontend-red-herring",
  category: "read-only-analysis",
  family: "regex-style",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls, stdout }) {
    const pageOriginal = await readFile(join(PLAYGROUND_SRC, "frontend/ReportsPage.tsx"), "utf-8");
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

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "recognizes there is no real bug",
            pass: /no (real )?bug|nothing is wrong|already correct|pattern is fine|this is intentional/i.test(
              answer
            ),
            weight: 2,
          },
          {
            name: "mentions page-owned query / prop-passing pattern",
            pass: /page .*owns.*query|owner of the query|pass(es|ing)? data .*props|child .*presentational|avoid duplicate fetch|container component|useQuery.*pass(es|ing)?.*prop|pass(es|ing)?.*(reports?|data).*(as )?prop/i.test(
              answer
            ),
            weight: 1,
          },
        ],
        scope: [
          { name: "did NOT edit ReportsPage.tsx", pass: pageCurrent === pageOriginal, weight: 1 },
          {
            name: "did NOT edit ReportsTable.tsx",
            pass: tableCurrent === tableOriginal,
            weight: 1,
          },
        ],
        pattern: [
          {
            name: "does not recommend moving the fetch into the child",
            pass: !/table .*should fetch|child .*should fetch|move .*query .*table|move .*fetch .*table|use fetch/i.test(
              answer
            ),
            weight: 1,
          },
          {
            name: "did NOT use edit or write tool",
            pass: !hasCall(toolCalls, "edit") && !hasCall(toolCalls, "write"),
            weight: 1,
          },
        ],
        verification: [
          { name: "did not change any files", pass: scope.pass, weight: 1, detail: scope.detail },
        ],
        cleanup: [
          {
            name: "no added comments",
            pass: noAddedComments(
              `${pageCurrent}\n${tableCurrent}`,
              `${pageOriginal}\n${tableOriginal}`
            ),
            weight: 1,
          },
          {
            name: "no console.log added",
            pass: noConsoleLog(`${pageCurrent}\n${tableCurrent}`),
            weight: 1,
          },
        ],
      },
      {
        pass: "Recognized the red herring and preserved the existing ownership pattern.",
        partial:
          "Avoided editing, but explanation was incomplete or drifted toward unnecessary changes.",
        fail: "Invented a bug or tried to rewrite the data ownership pattern.",
      }
    );
  },
};

export default scenario;
