import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { checksToEvaluation, hasCall } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import { PLAYGROUND_SRC, noFilesChanged, stripComments } from "./_shared/helpers.js";

export const meta = {
  id: "SB-09",
  name: "frontend-red-herring",
  category: "read-only-analysis" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
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
        pass: /page .*owns.*query|owner of the query|pass(es|ing)? data .*props|child .*presentational|avoid duplicate fetch|container component|useQuery.*pass(es|ing)?.*prop|pass(es|ing)?.*(reports?|data).*(as )?prop/i.test(
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
};

export default scenario;
