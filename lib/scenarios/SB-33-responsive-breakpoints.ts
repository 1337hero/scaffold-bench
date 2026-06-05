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

const DIR = "playground/sb33-responsive";

const commentsOf = (s: string) =>
  new Set((s.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) ?? []).map((c) => c.trim()));
const noCommentAdded = (current: string, original: string) => {
  const orig = commentsOf(original);
  return [...commentsOf(current)].every((c) => orig.has(c));
};

export const meta = {
  id: "SB-33",
  name: "responsive-breakpoints",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  evaluatorKind: "unit" as const,
  stacks: ["react", "typescript"] as const,
  taskType: "bugfix" as const,
  difficulty: "small" as const,
  surface: "frontend" as const,
  tests: {
    public: ["playground/sb33-responsive/grid.test.ts"],
    hidden: ["lib/scenarios/hidden/SB-33/breakpoints.test.ts"],
  },
  fixturePath: "playground/sb33-responsive/",
  prompt: `A refactor regressed the responsive product grid in \`playground/sb33-responsive/grid.ts\`. The design breakpoints are: <640 -> 1 col, [640,1024) -> 2, [1024,1280) -> 3, >=1280 -> 4. The current \`gridColumns\` has off-by-one boundaries (e.g. 1024 renders 2 columns instead of 3). Fix the breakpoints to match the design exactly. Keep the signature.`,
} as const;

const scenario: Scenario = {
  id: "SB-33" as ScenarioId,
  name: "responsive-breakpoints",
  category: "verify-and-repair",
  family: "regression",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, DIR);
    const path = join(fixtureDir, "grid.ts");
    const src = await readFile(path, "utf-8");
    const original = await readFile(join(PLAYGROUND_SRC, "sb33-responsive/grid.ts"), "utf-8");

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [`${DIR}/grid.ts`],
    });

    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);

    const publicTest = bunAvailable()
      ? await runBunTest(fixtureDir, "grid.test.ts")
      : { pass: false, stdout: "", stderr: "bun unavailable" };
    const hidden = await runHiddenTests("SB-33", fixtureDir);
    const correct = publicTest.pass && hidden.total > 0 && hidden.rate === 1;

    const keepsSignature = /export\s+function\s+gridColumns\s*\(/.test(src);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "all breakpoint boundaries match the design (behavioral)",
            pass: correct,
            weight: 3,
            detail: correct ? undefined : publicTest.stdout + "\n" + publicTest.stderr,
          },
        ],
        scope: [
          { name: "edited only grid.ts", pass: scope.pass, weight: 2, detail: scope.detail },
        ],
        pattern: [
          { name: "kept the gridColumns signature", pass: keepsSignature, weight: 1 },
          { name: "still returns the four documented column counts", pass: /\b4\b/.test(src) && /\b1\b/.test(src), weight: 1 },
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
        pass: "Breakpoints match the design at every boundary; signature intact.",
        partial: "Fixed some boundaries but at least one edge is still off.",
        fail: "Breakpoint boundaries still wrong.",
      }
    );
  },
};

export default scenario;
