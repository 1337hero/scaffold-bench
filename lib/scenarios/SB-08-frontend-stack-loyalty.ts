import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { checksToEvaluation, hasCall } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import {
  PLAYGROUND_SRC,
  firstChangeTurn,
  firstTurn,
  onlyChangedFiles,
  stripComments,
} from "./_shared/helpers.js";

export const meta = {
  id: "SB-08",
  name: "frontend-stack-loyalty",
  category: "surgical-edit" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  fixturePath: "playground/frontend/",
  prompt: `Finish playground/frontend/ActivityFeed.tsx using the existing frontend stack already established in playground/frontend. Keep the component shape. Do not introduce fetch, manual async state, or new client wrappers.`,
} as const;

const scenario: Scenario = {
  id: "SB-08" as ScenarioId,
  name: "frontend-stack-loyalty",
  category: "surgical-edit",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const current = await readFile(
      join(playgroundDir, "playground/frontend/ActivityFeed.tsx"),
      "utf-8"
    );
    const client = await readFile(
      join(playgroundDir, "playground/frontend/apiClient.ts"),
      "utf-8"
    );
    const originalClient = await readFile(join(PLAYGROUND_SRC, "frontend/apiClient.ts"), "utf-8");
    const code = stripComments(current);
    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);
    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/frontend/ActivityFeed.tsx"],
    });

    const checks = [
      {
        name: "read files before changing them (turn-ordered)",
        pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
      },
      {
        name: "edited only ActivityFeed.tsx",
        pass: scope.pass,
        detail: scope.detail,
      },
      {
        name: "uses TanStack Query for loading",
        pass: /useQuery\s*\(/.test(code),
      },
      {
        name: "uses existing api client for /activities",
        pass:
          /from\s+["']\.\/apiClient["']/.test(current) &&
          /api\.get\s*(?:<[\s\S]*?>)?\s*\(\s*["'`]\/activities["'`]/.test(code),
      },
      {
        name: "does not introduce manual async state or fetch",
        pass:
          !/fetch\s*\(/.test(code) &&
          !/\baxios\b/.test(code) &&
          !/useEffect\s*\(/.test(code) &&
          !/setIsLoading|setActivities|setError/.test(code),
      },
      {
        name: "replaced the placeholder state with query data",
        pass:
          !/const\s+activities\s*:\s*Activity\[\]\s*=\s*\[\s*\]/.test(code) &&
          !/const\s+isLoading\s*=\s*false/.test(code) &&
          !/const\s+error\b[^=]*=\s*null/.test(code),
      },
      {
        name: "existing api client left untouched",
        pass: client === originalClient,
      },
    ];

    return checksToEvaluation(checks, {
      pass: "Implemented the feature with the established stack and no architecture drift.",
      partial:
        "Implemented the feature, but with some unnecessary stack drift or extra machinery.",
      fail: "Did not use the established stack for data loading.",
    });
  },
};

export default scenario;
