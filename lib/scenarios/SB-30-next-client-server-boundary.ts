import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  firstChangeTurn,
  firstTurn,
  noConsoleLog,
  onlyChangedFiles,
} from "./_shared/helpers.js";
import { componentUsesHook, importsOf, fileCalls } from "./_shared/evaluators/index.js";

const DIR = "playground/sb30-next-boundary";

const commentsOf = (s: string) =>
  new Set((s.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) ?? []).map((c) => c.trim()));
const noCommentAdded = (current: string, original: string) => {
  const orig = commentsOf(original);
  return [...commentsOf(current)].every((c) => orig.has(c));
};

export const meta = {
  id: "SB-30",
  name: "next-client-server-boundary",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  evaluatorKind: "ast" as const,
  stacks: ["next", "react", "typescript"] as const,
  taskType: "security" as const,
  difficulty: "medium" as const,
  surface: "frontend" as const,
  tests: { public: [], hidden: [] },
  fixturePath: "playground/sb30-next-boundary/",
  prompt: `\`playground/sb30-next-boundary/app/UserMenu.tsx\` is an interactive component (it uses \`useState\` and \`onClick\`) but it's missing the \`"use client"\` directive AND it imports the server-only \`serverData\` module, pulling \`getApiSecret()\` into the client bundle. Make it a proper Client Component: add the directive, drop the server-only import, and render the name from its existing \`userName\` prop. Don't touch \`serverData.ts\`.`,
} as const;

const scenario: Scenario = {
  id: "SB-30" as ScenarioId,
  name: "next-client-server-boundary",
  category: "verify-and-repair",
  family: "regression",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, DIR);
    const menuPath = join(fixtureDir, "app/UserMenu.tsx");
    const menu = await readFile(menuPath, "utf-8");
    const original = await readFile(
      join(PLAYGROUND_SRC, "sb30-next-boundary/app/UserMenu.tsx"),
      "utf-8"
    );
    const originalServer = await readFile(
      join(PLAYGROUND_SRC, "sb30-next-boundary/app/serverData.ts"),
      "utf-8"
    );
    const currentServer = await readFile(join(fixtureDir, "app/serverData.ts"), "utf-8");

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [`${DIR}/app/UserMenu.tsx`],
    });

    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);

    // AST/structural correctness (the boundary IS the behavior here):
    // "use client" must be the first directive, the server-only module must not
    // be imported, and the leaked secret call must be gone.
    const hasUseClient = /^\s*("use client"|'use client')\s*;?/.test(menu);
    const imports = importsOf(menuPath);
    const noServerImport = !imports.some((i) => /serverData/.test(i));
    const noSecretCall = !fileCalls(menuPath, "getApiSecret");

    const stillInteractive = componentUsesHook(menuPath, "UserMenu", "useState");
    const usesProp = /props\.userName|\{\s*userName\s*\}/.test(menu);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "client boundary fixed: directive added, no server-only import, secret call removed (AST)",
            pass: hasUseClient && noServerImport && noSecretCall,
            weight: 3,
          },
        ],
        scope: [
          { name: "edited only UserMenu.tsx", pass: scope.pass, weight: 1, detail: scope.detail },
          { name: "serverData.ts byte-identical", pass: currentServer === originalServer, weight: 1 },
        ],
        pattern: [
          { name: "still an interactive client component (uses useState)", pass: stillInteractive, weight: 1 },
          { name: "renders the name from the userName prop", pass: usesProp, weight: 1 },
        ],
        verification: [
          {
            name: "read file before changing it (turn-ordered)",
            pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
            weight: 1,
          },
        ],
        cleanup: [
          { name: "no comments added", pass: noCommentAdded(menu, original), weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(menu), weight: 1 },
        ],
      },
      {
        pass: "Client boundary fixed: directive added, no server-only import, secret no longer leaks.",
        partial: "Partially fixed the boundary but left a server import or the leaked call.",
        fail: "Did not correctly establish the client/server boundary.",
      }
    );
  },
};

export default scenario;
