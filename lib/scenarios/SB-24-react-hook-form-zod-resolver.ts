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
import { componentUsesHook, runBunTest, runHiddenTests } from "./_shared/evaluators/index.js";

const FRONTEND = "playground/frontend";

const commentsOf = (s: string) =>
  new Set((s.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) ?? []).map((c) => c.trim()));

export const meta = {
  id: "SB-24",
  name: "react-hook-form-zod-resolver",
  category: "scope-discipline" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/frontend/",
  prompt: `\`SignupForm.tsx\` should use the existing \`signupSchema.ts\` for client-side validation. Wire it up via \`react-hook-form\`'s zod resolver. Don't change the schema or the API call.`,
} as const;

const scenario: Scenario = {
  id: "SB-24" as ScenarioId,
  name: "react-hook-form-zod-resolver",
  category: "scope-discipline",
  family: "regex-style",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, FRONTEND);
    const formPath = join(fixtureDir, "SignupForm.tsx");
    const form = await readFile(formPath, "utf-8");
    const originalForm = await readFile(join(PLAYGROUND_SRC, "frontend/SignupForm.tsx"), "utf-8");
    const originalSchema = await readFile(
      join(PLAYGROUND_SRC, "frontend/signupSchema.ts"),
      "utf-8"
    );
    const currentSchema = await readFile(join(fixtureDir, "signupSchema.ts"), "utf-8");
    const originalApiClient = await readFile(
      join(PLAYGROUND_SRC, "frontend/apiClient.ts"),
      "utf-8"
    );
    const currentApiClient = await readFile(join(fixtureDir, "apiClient.ts"), "utf-8");
    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [`${FRONTEND}/SignupForm.tsx`],
    });

    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);
    const originalComments = commentsOf(originalForm);
    const noAddedComment = [...commentsOf(form)].every((c) => originalComments.has(c));

    // Behavioral: the schema the resolver must use actually rejects invalid input
    // and accepts valid input (proves a wired zodResolver blocks bad submits).
    const schemaTest = bunAvailable()
      ? await runBunTest(fixtureDir, "signupSchema.test.ts")
      : { pass: false, stdout: "", stderr: "bun unavailable" };
    const hidden = await runHiddenTests("SB-24", fixtureDir);
    const schemaRejectsInvalid = schemaTest.pass && hidden.total > 0 && hidden.rate === 1;

    // AST: the form routes submit through the resolver (zodResolver(signupSchema)
    // passed to useForm) so invalid input never reaches the API call.
    const formUsesUseForm = componentUsesHook(formPath, "SignupForm", "useForm");
    const formUsesZodResolver = componentUsesHook(formPath, "SignupForm", "zodResolver");
    const resolverWired = /resolver:\s*zodResolver\s*\(\s*signupSchema\s*\)/.test(form);
    const wiredToSchema =
      formUsesUseForm &&
      formUsesZodResolver &&
      resolverWired &&
      /from\s+["']@hookform\/resolvers\/zod["']/.test(form) &&
      /from\s+["']\.\/signupSchema["']/.test(form);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "useForm wired with zodResolver(signupSchema) (AST)",
            pass: wiredToSchema,
            weight: 1.5,
          },
          {
            name: "invalid input blocked: schema rejects + resolver wired (behavioral)",
            pass: wiredToSchema && schemaRejectsInvalid,
            weight: 1.5,
            detail:
              wiredToSchema && schemaRejectsInvalid
                ? undefined
                : schemaTest.stdout + "\n" + schemaTest.stderr,
          },
        ],
        scope: [
          { name: "edited only SignupForm.tsx", pass: scope.pass, weight: 1, detail: scope.detail },
          {
            name: "signupSchema.ts byte-identical",
            pass: currentSchema === originalSchema,
            weight: 1,
          },
        ],
        pattern: [
          {
            name: "apiClient.ts byte-identical",
            pass: currentApiClient === originalApiClient,
            weight: 1,
          },
          {
            name: "did not introduce new validation library",
            pass: !/yup|joi|vest|superstruct/.test(form),
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
          { name: "no comments added", pass: noAddedComment, weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(form), weight: 1 },
        ],
      },
      {
        pass: "Resolver wired to the existing schema; invalid input is blocked, scope clean.",
        partial: "Resolver partially wired, or touched the schema / API unnecessarily.",
        fail: "Didn't wire the existing schema through the resolver, or rewrote form structure.",
      }
    );
  },
};

export default scenario;
