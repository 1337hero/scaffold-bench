import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  firstChangeTurn,
  firstTurn,
  noAddedComments,
  noConsoleLog,
  onlyChangedFiles,
  stripComments,
} from "./_shared/helpers.js";
import { componentUsesHook, fileCalls, importsOf } from "./_shared/evaluators/ast.js";

export const meta = {
  id: "SB-05",
  name: "frontend-stack-loyalty",
  category: "surgical-edit" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  evaluatorKind: "ast" as const,
  fixturePath: "playground/frontend/",
  prompt: `Finish playground/frontend/ActivityFeed.tsx using the existing frontend stack already established in playground/frontend. Keep the component shape. Do not introduce fetch, manual async state, or new client wrappers.`,
} as const;

const scenario: Scenario = {
  id: "SB-05" as ScenarioId,
  name: "frontend-stack-loyalty",
  category: "surgical-edit",
  family: "regex-style",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const filePath = join(playgroundDir, "playground/frontend/ActivityFeed.tsx");
    const current = await readFile(filePath, "utf-8");
    const original = await readFile(join(PLAYGROUND_SRC, "frontend/ActivityFeed.tsx"), "utf-8");
    const client = await readFile(join(playgroundDir, "playground/frontend/apiClient.ts"), "utf-8");
    const originalClient = await readFile(join(PLAYGROUND_SRC, "frontend/apiClient.ts"), "utf-8");
    const code = stripComments(current);
    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);
    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/frontend/ActivityFeed.tsx"],
    });

    // AST: loads through the established stack — the component runs useQuery and
    // imports the existing apiClient — and does NOT hand-roll fetch/useEffect.
    const imports = importsOf(filePath);
    const usesQuery = componentUsesHook(filePath, "ActivityFeed", "useQuery");
    const reusesClient = imports.some((i) => /\.\/apiClient/.test(i));
    const noManualAsync = !fileCalls(filePath, "fetch") && !fileCalls(filePath, "useEffect");

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "loads via the existing stack: useQuery + apiClient, no hand-rolled fetch/effect (AST)",
            pass: usesQuery && reusesClient && noManualAsync,
            weight: 3,
          },
        ],
        scope: [
          {
            name: "edited only ActivityFeed.tsx",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "existing api client left untouched",
            pass: client === originalClient,
            weight: 1,
          },
          {
            name: "does not introduce manual async state or fetch",
            pass:
              !/fetch\s*\(/.test(code) &&
              !/\baxios\b/.test(code) &&
              !/useEffect\s*\(/.test(code) &&
              !/setIsLoading|setActivities|setError/.test(code),
            weight: 1,
          },
        ],
        verification: [
          {
            name: "read files before changing them (turn-ordered)",
            pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
            weight: 1,
          },
        ],
        cleanup: [
          { name: "no added comments", pass: noAddedComments(current, original), weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(current), weight: 1 },
        ],
      },
      {
        pass: "Implemented the feature with the established stack and no architecture drift.",
        partial:
          "Implemented the feature, but with some unnecessary stack drift or extra machinery.",
        fail: "Did not use the established stack for data loading.",
      }
    );
  },
};

export default scenario;
