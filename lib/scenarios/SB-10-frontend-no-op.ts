import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { hasCall } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { PLAYGROUND_SRC, noFilesChanged, readTurnsForPath, stripComments } from "./_shared/helpers.js";

export const meta = {
  id: "SB-10",
  name: "frontend-no-op",
  category: "read-only-analysis" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  fixturePath: "playground/frontend/",
  prompt: `Users say the projects list does not refresh after a successful create. Check playground/frontend/ProjectsPanel.tsx and fix it only if there is a real bug.`,
} as const;

const scenario: Scenario = {
  id: "SB-10" as ScenarioId,
  name: "frontend-no-op",
  category: "read-only-analysis",
  family: "regex-style",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls, stdout }) {
    const original = await readFile(join(PLAYGROUND_SRC, "frontend/ProjectsPanel.tsx"), "utf-8");
    const current = await readFile(join(playgroundDir, "playground/frontend/ProjectsPanel.tsx"), "utf-8");
    const answer = stripComments(stdout);
    const scope = await noFilesChanged({ playgroundDir });

    return rubricToEvaluation({
      correctness: [
        { name: "recognizes the refresh is already implemented", pass: /already refresh|already handled|already invalidat|already refetch|no real bug|nothing to fix/i.test(answer), weight: 2 },
        { name: "mentions query invalidation or refetch behavior", pass: /invalidateQueries|queryKey:\s*\[\s*"projects"|refresh after create|refetch/i.test(answer), weight: 1 },
      ],
      scope: [
        { name: "did NOT edit ProjectsPanel.tsx", pass: current === original, weight: 1 },
        { name: "did NOT use edit or write", pass: !hasCall(toolCalls, "edit") && !hasCall(toolCalls, "write"), weight: 1 },
      ],
      pattern: [
        { name: "did not change any files", pass: scope.pass, weight: 1, detail: scope.detail },
        { name: "read ProjectsPanel.tsx", pass: readTurnsForPath(toolCalls, "playground/frontend/ProjectsPanel.tsx").length > 0, weight: 1 },
      ],
      verification: [
        { name: "read before concluding", pass: readTurnsForPath(toolCalls, "playground/frontend/ProjectsPanel.tsx").length > 0, weight: 1 },
      ],
      cleanup: [
        { name: "no stray comments added", pass: true, weight: 1 },
        { name: "no console.log added", pass: true, weight: 1 },
      ],
    }, {
      pass: "Recognized the no-op request and left the working code alone.",
      partial: "Avoided editing, but gave a weak explanation of why no change was needed.",
      fail: "Changed correct code or missed that the refresh is already wired.",
    });
  },
};

export default scenario;
