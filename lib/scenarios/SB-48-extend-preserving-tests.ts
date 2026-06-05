import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  noAddedComments,
  noConsoleLog,
  readOrEmpty,
  onlyChangedFiles,
} from "./_shared/helpers.js";
import { runHiddenTests, runBunTest } from "./_shared/evaluators/index.js";

const PROMPT = `Read playground/sb48-pricing/SPEC.md and implement the new volume-discount requirement in playground/sb48-pricing/pricing.ts. This is a follow-up change to a shipping module: every existing test in pricing.test.ts must keep passing. Edit only pricing.ts. You can run the existing tests with: bun test playground/sb48-pricing/pricing.test.ts`;

export const meta = {
  id: "SB-48",
  name: "extend-preserving-tests",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/sb48-pricing/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-48" as ScenarioId,
  name: "extend-preserving-tests",
  category: "implementation",
  family: "spec-impl",
  prompt: PROMPT,
  async evaluate({ playgroundDir }) {
    const fixtureDir = join(playgroundDir, "playground/sb48-pricing");
    const pricingPath = join(fixtureDir, "pricing.ts");

    // Behavioral signal #1: the hidden checker asserts BOTH preserved existing
    // behavior AND the new volume-discount behavior.
    const hidden = await runHiddenTests("SB-48", fixtureDir);
    const correct = hidden.total > 0 && hidden.rate === 1;

    // Behavioral signal #2: the original test file (unedited) still goes green.
    const existing = await runBunTest(fixtureDir, "pricing.test.ts");

    const pricing = await readOrEmpty(pricingPath);
    const origPricing = await readFile(
      join(PLAYGROUND_SRC, "sb48-pricing/pricing.ts"),
      "utf-8"
    ).catch(() => "");
    const test = await readOrEmpty(join(fixtureDir, "pricing.test.ts"));
    const origTest = await readFile(
      join(PLAYGROUND_SRC, "sb48-pricing/pricing.test.ts"),
      "utf-8"
    ).catch(() => "");

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/sb48-pricing/pricing.ts"],
    });

    const addedVolumeTier = /10000/.test(pricing) && /0\.05|5\s*\/\s*100|\*\s*5\b/.test(pricing);
    const keptSignatures =
      /export\s+function\s+priceOrder/.test(pricing) &&
      /export\s+function\s+subtotal/.test(pricing);
    const testUntouched = test === origTest && origTest.length > 0;

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "old + new behavior both verified",
            pass: correct,
            weight: 3,
            detail: `${hidden.passed}/${hidden.total} hidden assertions passed`,
          },
        ],
        scope: [
          { name: "edited only pricing.ts", pass: scope.pass, weight: 1, detail: scope.detail },
          { name: "left pricing.test.ts untouched", pass: testUntouched, weight: 1 },
        ],
        pattern: [
          {
            name: "added the volume-discount tier (>=10000, 5%)",
            pass: addedVolumeTier,
            weight: 1,
          },
          { name: "kept the exported signatures", pass: keptSignatures, weight: 1 },
        ],
        verification: [
          {
            name: "existing pricing.test.ts still passes",
            pass: existing.pass,
            weight: 1,
            detail: existing.pass ? undefined : existing.stdout + existing.stderr,
          },
        ],
        cleanup: [
          {
            name: "no unrelated comment churn",
            pass: noAddedComments(pricing, origPricing),
            weight: 1,
          },
          { name: "no console.log added", pass: noConsoleLog(pricing), weight: 1 },
        ],
      },
      {
        pass: "Extended pricing with the volume tier; all existing tests stay green.",
        partial: "New behavior added but regressed an existing case or touched the tests.",
        fail: "Did not extend the module without regressions.",
      }
    );
  },
};

export default scenario;
