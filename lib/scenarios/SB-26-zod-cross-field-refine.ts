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
  noAddedComments,
  noConsoleLog,
  onlyChangedFiles,
} from "./_shared/helpers.js";
import { runBunTest, runHiddenTests } from "./_shared/evaluators/index.js";

const DIR = "playground/sb26-checkout-schema";

export const meta = {
  id: "SB-26",
  name: "zod-cross-field-refine",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  evaluatorKind: "unit" as const,
  stacks: ["zod", "react-hook-form", "typescript"] as const,
  taskType: "bugfix" as const,
  difficulty: "small" as const,
  surface: "frontend" as const,
  tests: {
    public: ["playground/sb26-checkout-schema/checkoutSchema.test.ts"],
    hidden: ["lib/scenarios/hidden/SB-26/cross-field-validation.test.ts"],
  },
  fixturePath: "playground/sb26-checkout-schema/",
  prompt: `In \`playground/sb26-checkout-schema/checkoutSchema.ts\`, the checkout form accepts two bad submits: \`password\` and \`confirmPassword\` can differ, and when \`shipToDifferentAddress\` is true a blank \`shippingAddress\` slips through. Enforce both rules with zod. Don't change the field shape or add a new validation library.`,
} as const;

const scenario: Scenario = {
  id: "SB-26" as ScenarioId,
  name: "zod-cross-field-refine",
  category: "implementation",
  family: "spec-impl",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, DIR);
    const schemaPath = join(fixtureDir, "checkoutSchema.ts");
    const schema = await readFile(schemaPath, "utf-8");
    const original = await readFile(
      join(PLAYGROUND_SRC, "sb26-checkout-schema/checkoutSchema.ts"),
      "utf-8"
    );

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [`${DIR}/checkoutSchema.ts`],
    });

    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);

    // Behavioral: the schema actually rejects mismatched passwords and a missing
    // shipping address (cross-field rules a base z.object can't express).
    const publicTest = bunAvailable()
      ? await runBunTest(fixtureDir, "checkoutSchema.test.ts")
      : { pass: false, stdout: "", stderr: "bun unavailable" };
    const hidden = await runHiddenTests("SB-26", fixtureDir);
    const enforced = publicTest.pass && hidden.total > 0 && hidden.rate === 1;

    const usesRefine = /\.(superRefine|refine)\s*\(/.test(schema);
    const keepsFieldShape =
      /shipToDifferentAddress/.test(schema) &&
      /shippingAddress/.test(schema) &&
      /confirmPassword/.test(schema);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "cross-field rules enforced: mismatch + missing shipping rejected (behavioral)",
            pass: enforced,
            weight: 3,
            detail: enforced ? undefined : publicTest.stdout + "\n" + publicTest.stderr,
          },
        ],
        scope: [
          {
            name: "edited only checkoutSchema.ts",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "used zod refine/superRefine for cross-field checks",
            pass: usesRefine,
            weight: 1,
          },
          {
            name: "kept the field shape and no new validation library",
            pass: keepsFieldShape && !/yup|joi|vest|superstruct/.test(schema),
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
          { name: "no comments added", pass: noAddedComments(schema, original), weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(schema), weight: 1 },
        ],
      },
      {
        pass: "Both cross-field rules enforced via zod refine; field shape and scope intact.",
        partial: "Enforced one rule, or drifted on shape / left junk behind.",
        fail: "Did not enforce the cross-field rules with zod.",
      }
    );
  },
};

export default scenario;
