import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  bunAvailable,
  firstChangeTurn,
  firstTurn,
  noConsoleLog,
  onlyChangedFiles,
  readOrEmpty,
} from "./_shared/helpers.js";
import { importsOf, runBunTest, runHiddenTests } from "./_shared/evaluators/index.js";

const DIR = "playground/sb34-extract";

export const meta = {
  id: "SB-34",
  name: "component-extraction",
  category: "surgical-edit" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  evaluatorKind: "ast" as const,
  stacks: ["react", "typescript"] as const,
  taskType: "refactor" as const,
  difficulty: "small" as const,
  surface: "frontend" as const,
  tests: {
    public: ["playground/sb34-extract/priceTag.test.ts"],
    hidden: ["lib/scenarios/hidden/SB-34/extraction-behavior.test.ts"],
  },
  fixturePath: "playground/sb34-extract/",
  prompt: `Refactor \`playground/sb34-extract/priceTag.ts\`: extract \`formatDiscount\` into a new sibling module \`formatDiscount.ts\` (exporting it), and import it back into \`priceTag.ts\`. Do not change any observable behavior — \`renderPriceTag\` must return identical strings and the existing test must keep passing. Don't leave a duplicate copy behind.`,
} as const;

const scenario: Scenario = {
  id: "SB-34" as ScenarioId,
  name: "component-extraction",
  category: "surgical-edit",
  family: "regex-style",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, DIR);
    const priceTagPath = join(fixtureDir, "priceTag.ts");
    const extractedPath = join(fixtureDir, "formatDiscount.ts");
    const priceTag = await readFile(priceTagPath, "utf-8");
    const extracted = await readOrEmpty(extractedPath);

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [`${DIR}/priceTag.ts`, `${DIR}/formatDiscount.ts`],
    });

    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);

    const publicTest = bunAvailable()
      ? await runBunTest(fixtureDir, "priceTag.test.ts")
      : { pass: false, stdout: "", stderr: "bun unavailable" };
    const hidden = await runHiddenTests("SB-34", fixtureDir);
    const behaviorUnchanged = publicTest.pass && hidden.total > 0 && hidden.rate === 1;

    // AST: the extracted module exists, exports formatDiscount, and priceTag
    // imports it back (extraction, not duplication).
    const extractedExports = /export\s+function\s+formatDiscount/.test(extracted);
    const priceTagImportsIt = importsOf(priceTagPath).some((i) => /\.\/formatDiscount/.test(i));
    // Cleanup: no duplicate definition left behind in priceTag.
    const noDuplicate = !/function\s+formatDiscount/.test(priceTag);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "behavior unchanged: renderPriceTag + formatDiscount identical (behavioral)",
            pass: behaviorUnchanged,
            weight: 3,
            detail: behaviorUnchanged ? undefined : publicTest.stdout + "\n" + publicTest.stderr,
          },
        ],
        scope: [
          {
            name: "edited only priceTag.ts and added formatDiscount.ts",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          { name: "formatDiscount lives in its own module", pass: extractedExports, weight: 1 },
          { name: "priceTag imports the extracted module (AST)", pass: priceTagImportsIt, weight: 1 },
        ],
        verification: [
          {
            name: "read file before changing it (turn-ordered)",
            pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
            weight: 1,
          },
        ],
        cleanup: [
          { name: "no duplicate formatDiscount left in priceTag", pass: noDuplicate, weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(priceTag) && noConsoleLog(extracted), weight: 1 },
        ],
      },
      {
        pass: "Clean extraction: own module, imported back, behavior identical, no duplicate.",
        partial: "Extracted but left a duplicate, broke an import, or shifted behavior.",
        fail: "Did not extract-and-reuse without changing behavior.",
      }
    );
  },
};

export default scenario;
