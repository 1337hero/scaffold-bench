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

const DIR = "playground/sb27-optimistic-like";

export const meta = {
  id: "SB-27",
  name: "optimistic-rollback",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  evaluatorKind: "unit" as const,
  stacks: ["react", "typescript"] as const,
  taskType: "bugfix" as const,
  difficulty: "medium" as const,
  surface: "frontend" as const,
  tests: {
    public: ["playground/sb27-optimistic-like/likeStore.test.ts"],
    hidden: ["lib/scenarios/hidden/SB-27/rollback-on-error.test.ts"],
  },
  fixturePath: "playground/sb27-optimistic-like/",
  prompt: `Users report that when liking a post fails, the heart stays filled and the count stays bumped. In \`playground/sb27-optimistic-like/likeStore.ts\`, \`toggleLike\` applies the optimistic update but never rolls back when \`save\` rejects. Snapshot the prior state and restore it on failure. Keep the optimistic-update-first behavior and don't change the public API.`,
} as const;

const scenario: Scenario = {
  id: "SB-27" as ScenarioId,
  name: "optimistic-rollback",
  category: "verify-and-repair",
  family: "regression",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, DIR);
    const storePath = join(fixtureDir, "likeStore.ts");
    const store = await readFile(storePath, "utf-8");
    const original = await readFile(
      join(PLAYGROUND_SRC, "sb27-optimistic-like/likeStore.ts"),
      "utf-8"
    );

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [`${DIR}/likeStore.ts`],
    });

    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);

    // Behavioral: optimistic update lands first, save fires once, and a rejected
    // save restores the exact prior snapshot (no count drift across retries).
    const publicTest = bunAvailable()
      ? await runBunTest(fixtureDir, "likeStore.test.ts")
      : { pass: false, stdout: "", stderr: "bun unavailable" };
    const hidden = await runHiddenTests("SB-27", fixtureDir);
    const rollsBack = publicTest.pass && hidden.total > 0 && hidden.rate === 1;

    const handlesError = /catch\b/.test(store) && /try\b/.test(store);
    const keepsApi =
      /toggleLike/.test(store) && /createLikeStore/.test(store) && /get\s*\(/.test(store);
    const stillOptimistic = /state\s*=\s*next|count\s*[+-]\s*1/.test(store);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "failed save rolls back to the prior snapshot (behavioral)",
            pass: rollsBack,
            weight: 3,
            detail: rollsBack ? undefined : publicTest.stdout + "\n" + publicTest.stderr,
          },
        ],
        scope: [
          { name: "edited only likeStore.ts", pass: scope.pass, weight: 2, detail: scope.detail },
        ],
        pattern: [
          { name: "rolls back inside a try/catch around save", pass: handlesError, weight: 1 },
          {
            name: "kept the optimistic-first update and public API",
            pass: stillOptimistic && keepsApi,
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
          { name: "no comments added", pass: noAddedComments(store, original), weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(store), weight: 1 },
        ],
      },
      {
        pass: "Optimistic update with a clean snapshot rollback on failure; API intact.",
        partial: "Added some error handling but the rollback drifts state or left junk.",
        fail: "Did not restore the prior state when the save rejects.",
      }
    );
  },
};

export default scenario;
