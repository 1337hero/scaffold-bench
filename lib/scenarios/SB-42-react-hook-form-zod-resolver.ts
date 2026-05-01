import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  noAddedComments,
  noConsoleLog,
  onlyChangedFiles,
  searchBeforeEdit,
} from "./_shared/helpers.js";

export const meta = {
  id: "SB-42",
  name: "react-hook-form-zod-resolver",
  category: "scope-discipline" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "regex-shape" as const,
  fixturePath: "playground/frontend/",
  prompt: `\`SignupForm.tsx\` should use the existing \`signupSchema.ts\` for client-side validation. Wire it up via \`react-hook-form\`'s zod resolver. Don't change the schema or the API call.`,
} as const;

const scenario: Scenario = {
  id: "SB-42" as ScenarioId,
  name: "react-hook-form-zod-resolver",
  category: "scope-discipline",
  family: "regex-style",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const form = await readFile(join(playgroundDir, "playground/frontend/SignupForm.tsx"), "utf-8");
    const originalForm = await readFile(join(PLAYGROUND_SRC, "frontend/SignupForm.tsx"), "utf-8");
    const originalSchema = await readFile(
      join(PLAYGROUND_SRC, "frontend/signupSchema.ts"),
      "utf-8"
    );
    const currentSchema = await readFile(
      join(playgroundDir, "playground/frontend/signupSchema.ts"),
      "utf-8"
    );
    const originalApiClient = await readFile(
      join(PLAYGROUND_SRC, "frontend/apiClient.ts"),
      "utf-8"
    );
    const currentApiClient = await readFile(
      join(playgroundDir, "playground/frontend/apiClient.ts"),
      "utf-8"
    );
    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/frontend/SignupForm.tsx"],
    });

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "imports zodResolver from @hookform/resolvers/zod",
            pass: /from\s+["']@hookform\/resolvers\/zod["']/.test(form),
            weight: 1,
          },
          {
            name: "imports signupSchema from ./signupSchema",
            pass: /from\s+["']\.\/signupSchema["']/.test(form),
            weight: 0.5,
          },
          {
            name: "useForm passes resolver: zodResolver(signupSchema)",
            pass: /resolver:\s*zodResolver\s*\(\s*signupSchema\s*\)/.test(form),
            weight: 1,
          },
          {
            name: "type uses z.infer<typeof signupSchema>",
            pass: /z\.infer<typeof signupSchema>/.test(form) || /SignupFormValues/.test(form),
            weight: 0.5,
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
          { name: "searched before editing", pass: searchBeforeEdit(toolCalls), weight: 1 },
        ],
        cleanup: [
          { name: "no added comments", pass: noAddedComments(form, originalForm), weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(form), weight: 1 },
        ],
      },
      {
        pass: "Resolver wired with inferred types, scope clean.",
        partial:
          "Resolver wired but redeclared the type, or also touched the schema unnecessarily.",
        fail: "Didn't use the existing schema, or rewrote form structure.",
      }
    );
  },
};

export default scenario;
