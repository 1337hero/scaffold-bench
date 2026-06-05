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

const DIR = "playground/sb35-focus-trap";

const commentsOf = (s: string) =>
  new Set((s.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) ?? []).map((c) => c.trim()));
const noCommentAdded = (current: string, original: string) => {
  const orig = commentsOf(original);
  return [...commentsOf(current)].every((c) => orig.has(c));
};

export const meta = {
  id: "SB-35",
  name: "focus-trap",
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
    public: ["playground/sb35-focus-trap/focusTrap.test.ts"],
    hidden: ["lib/scenarios/hidden/SB-35/focus-wraps.test.ts"],
  },
  fixturePath: "playground/sb35-focus-trap/",
  prompt: `\`playground/sb35-focus-trap/focusTrap.ts\` is supposed to trap keyboard focus inside a modal, but \`nextFocus\` lets focus escape: Tab on the last element and Shift+Tab on the first walk off the ends instead of wrapping. Make focus wrap in both directions so it stays trapped. Keep the function signature.`,
} as const;

const scenario: Scenario = {
  id: "SB-35" as ScenarioId,
  name: "focus-trap",
  category: "verify-and-repair",
  family: "regression",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, DIR);
    const path = join(fixtureDir, "focusTrap.ts");
    const src = await readFile(path, "utf-8");
    const original = await readFile(join(PLAYGROUND_SRC, "sb35-focus-trap/focusTrap.ts"), "utf-8");

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [`${DIR}/focusTrap.ts`],
    });

    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);

    const publicTest = bunAvailable()
      ? await runBunTest(fixtureDir, "focusTrap.test.ts")
      : { pass: false, stdout: "", stderr: "bun unavailable" };
    const hidden = await runHiddenTests("SB-35", fixtureDir);
    const trapped = publicTest.pass && hidden.total > 0 && hidden.rate === 1;

    const keepsSignature = /export\s+function\s+nextFocus\s*\(/.test(src);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "focus wraps both directions; never escapes the modal (behavioral)",
            pass: trapped,
            weight: 3,
            detail: trapped ? undefined : publicTest.stdout + "\n" + publicTest.stderr,
          },
        ],
        scope: [
          { name: "edited only focusTrap.ts", pass: scope.pass, weight: 2, detail: scope.detail },
        ],
        pattern: [
          { name: "kept the nextFocus signature", pass: keepsSignature, weight: 1 },
          {
            name: "wraps with index math (modulo / length), not ad-hoc branches per end",
            pass: /%\s*ids\.length|%\s*\w+\.length/.test(src),
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
        pass: "Focus wraps in both directions; signature intact, clean implementation.",
        partial: "Trapped one direction but the other still escapes.",
        fail: "Focus still escapes the modal.",
      }
    );
  },
};

export default scenario;
