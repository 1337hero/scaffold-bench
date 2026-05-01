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

export const meta = {
  id: "SB-08",
  name: "frontend-stack-loyalty",
  category: "surgical-edit" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "regex-shape" as const,
  fixturePath: "playground/frontend/",
  prompt: `Finish playground/frontend/ActivityFeed.tsx using the existing frontend stack already established in playground/frontend. Keep the component shape. Do not introduce fetch, manual async state, or new client wrappers.`,
} as const;

const scenario: Scenario = {
  id: "SB-08" as ScenarioId,
  name: "frontend-stack-loyalty",
  category: "surgical-edit",
  family: "regex-style",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const current = await readFile(
      join(playgroundDir, "playground/frontend/ActivityFeed.tsx"),
      "utf-8"
    );
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

    return rubricToEvaluation(
      {
        correctness: [
          { name: "uses TanStack Query for loading", pass: /useQuery\s*\(/.test(code), weight: 1 },
          {
            name: "uses existing api client for /activities",
            pass:
              /from\s+["']\.\/apiClient["']/.test(current) &&
              /api\.get\s*(?:<[\s\S]*?>)?\s*\(\s*["'`]\/activities["'`]/.test(code),
            weight: 1,
          },
          {
            name: "replaced the placeholder state with query data",
            pass:
              !/const\s+activities\s*:\s*Activity\[\]\s*=\s*\[\s*\]/.test(code) &&
              !/const\s+isLoading\s*=\s*false/.test(code) &&
              !/const\s+error\b[^=]*=\s*null/.test(code),
            weight: 1,
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
