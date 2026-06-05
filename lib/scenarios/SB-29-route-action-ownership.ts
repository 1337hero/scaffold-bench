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
import { fileCalls, runBunTest, runHiddenTests } from "./_shared/evaluators/index.js";

const DIR = "playground/sb29-route-action";

const commentsOf = (s: string) =>
  new Set((s.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) ?? []).map((c) => c.trim()));
const noCommentAdded = (current: string, original: string) => {
  const orig = commentsOf(original);
  return [...commentsOf(current)].every((c) => orig.has(c));
};

export const meta = {
  id: "SB-29",
  name: "route-action-ownership",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  evaluatorKind: "unit" as const,
  stacks: ["tanstack-router", "react", "typescript"] as const,
  taskType: "feature" as const,
  difficulty: "medium" as const,
  surface: "frontend" as const,
  tests: {
    public: ["playground/sb29-route-action/src/projectAction.test.ts"],
    hidden: ["lib/scenarios/hidden/SB-29/action-owns-mutation.test.ts"],
  },
  fixturePath: "playground/sb29-route-action/",
  prompt: `The route's create action in \`playground/sb29-route-action/src/projectAction.ts\` is a stub — it returns a fake success without validating or hitting the server, so the form has to call the API itself. Implement \`projectAction\` so it owns the mutation: validate with the existing \`validateProject\`, call \`post("/projects", input)\` exactly once on valid input, and return \`{ ok: true, id }\` on success or \`{ ok: false, error }\` on validation/server failure. Don't change \`createProject.ts\`.`,
} as const;

const scenario: Scenario = {
  id: "SB-29" as ScenarioId,
  name: "route-action-ownership",
  category: "implementation",
  family: "spec-impl",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, DIR);
    const actionPath = join(fixtureDir, "src/projectAction.ts");
    const actionSrc = await readFile(actionPath, "utf-8");
    const original = await readFile(
      join(PLAYGROUND_SRC, "sb29-route-action/src/projectAction.ts"),
      "utf-8"
    );
    const originalCreate = await readFile(
      join(PLAYGROUND_SRC, "sb29-route-action/src/createProject.ts"),
      "utf-8"
    );
    const currentCreate = await readFile(join(fixtureDir, "src/createProject.ts"), "utf-8");

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [`${DIR}/src/projectAction.ts`],
    });

    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);

    const publicTest = bunAvailable()
      ? await runBunTest(fixtureDir, "src/projectAction.test.ts")
      : { pass: false, stdout: "", stderr: "bun unavailable" };
    const hidden = await runHiddenTests("SB-29", fixtureDir);
    const ownsMutation = publicTest.pass && hidden.total > 0 && hidden.rate === 1;

    const reusesValidator = fileCalls(actionPath, "validateProject");
    const callsPost = fileCalls(actionPath, "post");

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "action validates, calls post once on valid input, normalizes result (behavioral)",
            pass: ownsMutation,
            weight: 3,
            detail: ownsMutation ? undefined : publicTest.stdout + "\n" + publicTest.stderr,
          },
        ],
        scope: [
          {
            name: "edited only projectAction.ts",
            pass: scope.pass,
            weight: 1,
            detail: scope.detail,
          },
          { name: "createProject.ts byte-identical", pass: currentCreate === originalCreate, weight: 1 },
        ],
        pattern: [
          { name: "reuses the existing validateProject (AST)", pass: reusesValidator, weight: 1 },
          { name: "routes the mutation through post", pass: callsPost, weight: 1 },
        ],
        verification: [
          {
            name: "read file before changing it (turn-ordered)",
            pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
            weight: 1,
          },
        ],
        cleanup: [
          { name: "no comments added", pass: noCommentAdded(actionSrc, original), weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(actionSrc), weight: 1 },
        ],
      },
      {
        pass: "Action owns the mutation: validates, single post, normalized result; scope clean.",
        partial: "Implemented part of the action but skipped validation/normalization or drifted.",
        fail: "Action does not own the mutation correctly.",
      }
    );
  },
};

export default scenario;
