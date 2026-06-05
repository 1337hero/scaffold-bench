import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  bunAvailable,
  firstChangeTurn,
  firstTurn,
  noConsoleLog,
  onlyChangedFiles,
} from "./_shared/helpers.js";
import { runBunTest, runHiddenTests } from "./_shared/evaluators/index.js";

const DIR = "playground/sb31-view-state";

const commentsOf = (s: string) =>
  new Set((s.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) ?? []).map((c) => c.trim()));
const noCommentAdded = (current: string, original: string) => {
  const orig = commentsOf(original);
  return [...commentsOf(current)].every((c) => orig.has(c));
};

export const meta = {
  id: "SB-31",
  name: "view-state-precedence",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  evaluatorKind: "unit" as const,
  stacks: ["react", "tanstack-query", "typescript"] as const,
  taskType: "bugfix" as const,
  difficulty: "small" as const,
  surface: "frontend" as const,
  tests: {
    public: ["playground/sb31-view-state/viewState.test.ts"],
    hidden: ["lib/scenarios/hidden/SB-31/view-state-precedence.test.ts"],
  },
  fixturePath: "playground/sb31-view-state/",
  prompt: `In \`playground/sb31-view-state/viewState.ts\`, the list view shows the table for an empty result and swallows a refetch error when stale data is still present. Fix \`getViewState\` to honor the precedence loading > error > empty > ready. Keep the function signature and return type.`,
} as const;

const scenario: Scenario = {
  id: "SB-31" as ScenarioId,
  name: "view-state-precedence",
  category: "verify-and-repair",
  family: "regression",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, DIR);
    const path = join(fixtureDir, "viewState.ts");
    const src = await readFile(path, "utf-8");
    const original = await readFile(join(PLAYGROUND_SRC, "sb31-view-state/viewState.ts"), "utf-8");

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [`${DIR}/viewState.ts`],
    });

    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);

    const publicTest = bunAvailable()
      ? await runBunTest(fixtureDir, "viewState.test.ts")
      : { pass: false, stdout: "", stderr: "bun unavailable" };
    const hidden = await runHiddenTests("SB-31", fixtureDir);
    const correct = publicTest.pass && hidden.total > 0 && hidden.rate === 1;

    const keepsSignature = /export\s+function\s+getViewState/.test(src) && /ViewState/.test(src);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "loading > error > empty > ready precedence honored (behavioral)",
            pass: correct,
            weight: 3,
            detail: correct ? undefined : publicTest.stdout + "\n" + publicTest.stderr,
          },
        ],
        scope: [
          { name: "edited only viewState.ts", pass: scope.pass, weight: 2, detail: scope.detail },
        ],
        pattern: [
          {
            name: "kept the getViewState signature and ViewState type",
            pass: keepsSignature,
            weight: 1,
          },
          {
            name: "checks emptiness via length, not truthiness of data alone",
            pass: /\.length\s*===?\s*0|\.length\s*>\s*0|!\s*query\.data|!\s*data/.test(src),
            weight: 1,
          },
        ],
        verification: [
          {
            name: "read file before changing it (turn-ordered)",
            pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
            weight: 1,
          },
        ],
        cleanup: [
          { name: "no comments added", pass: noCommentAdded(src, original), weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(src), weight: 1 },
        ],
      },
      {
        pass: "All four states resolve with the correct precedence; signature intact.",
        partial: "Fixed some states but the precedence is still wrong somewhere.",
        fail: "Did not fix the empty/error precedence.",
      }
    );
  },
};

export default scenario;
