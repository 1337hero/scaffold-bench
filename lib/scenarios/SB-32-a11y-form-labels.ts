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
import { runAxe, isSkipped, runBunTest, runHiddenTests } from "./_shared/evaluators/index.js";

const DIR = "playground/sb32-a11y-labels";

const commentsOf = (s: string) =>
  new Set((s.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) ?? []).map((c) => c.trim()));
const noCommentAdded = (current: string, original: string) => {
  const orig = commentsOf(original);
  return [...commentsOf(current)].every((c) => orig.has(c));
};

export const meta = {
  id: "SB-32",
  name: "a11y-form-labels",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  evaluatorKind: "a11y" as const,
  stacks: ["react", "typescript"] as const,
  taskType: "bugfix" as const,
  difficulty: "small" as const,
  surface: "frontend" as const,
  tests: {
    public: ["playground/sb32-a11y-labels/searchForm.test.ts"],
    hidden: ["lib/scenarios/hidden/SB-32/labels-associated.test.ts"],
  },
  fixturePath: "playground/sb32-a11y-labels/",
  prompt: `The site search form in \`playground/sb32-a11y-labels/searchForm.ts\` is inaccessible: the text input has no associated \`<label>\` (a placeholder is not a label) and the icon-only submit button has no accessible name. Fix the markup so every input has a programmatically associated label (id + matching \`<label for>\`) and the button exposes an accessible name. Keep it the same search form.`,
} as const;

const scenario: Scenario = {
  id: "SB-32" as ScenarioId,
  name: "a11y-form-labels",
  category: "verify-and-repair",
  family: "regression",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, DIR);
    const path = join(fixtureDir, "searchForm.ts");
    const src = await readFile(path, "utf-8");
    const original = await readFile(
      join(PLAYGROUND_SRC, "sb32-a11y-labels/searchForm.ts"),
      "utf-8"
    );

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [`${DIR}/searchForm.ts`],
    });

    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);

    // Behavioral: parse the rendered markup and confirm the a11y contract.
    const publicTest = bunAvailable()
      ? await runBunTest(fixtureDir, "searchForm.test.ts")
      : { pass: false, stdout: "", stderr: "bun unavailable" };
    const hidden = await runHiddenTests("SB-32", fixtureDir);
    const accessible = publicTest.pass && hidden.total > 0 && hidden.rate === 1;

    // Optional axe pass: confirms zero violations when a browser is present;
    // when skipped (no browser) it does NOT cost points — score-exempt-guarded.
    let axeBonus = true;
    const axeSpec = join(fixtureDir, "a11y.spec.ts");
    try {
      await readFile(axeSpec, "utf-8");
      const axe = await runAxe(fixtureDir, "a11y.spec.ts");
      axeBonus = isSkipped(axe) ? true : axe.pass;
    } catch {
      axeBonus = true; // no spec present → no bonus penalty
    }

    const stillSearch = /role\s*=\s*["']search["']/.test(src);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "input labelled (id+for) and button has an accessible name (behavioral)",
            pass: accessible,
            weight: 3,
            detail: accessible ? undefined : publicTest.stdout + "\n" + publicTest.stderr,
          },
        ],
        scope: [
          { name: "edited only searchForm.ts", pass: scope.pass, weight: 2, detail: scope.detail },
        ],
        pattern: [
          {
            name: "used a real <label for> association",
            pass: /<label[^>]*\bfor=/.test(src),
            weight: 1,
          },
          {
            name: "kept it a search form (axe confirms when browser present)",
            pass: stillSearch && axeBonus,
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
        pass: "Input properly labelled and button named; markup still a search form.",
        partial: "Improved some a11y but left an unlabelled control or an unnamed button.",
        fail: "Did not make the form accessible (missing label association / button name).",
      }
    );
  },
};

export default scenario;
