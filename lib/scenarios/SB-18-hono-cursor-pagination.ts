import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { PLAYGROUND_SRC, noAddedComments, noConsoleLog, readOrEmpty } from "./_shared/helpers.js";

export const meta = {
  id: "SB-18",
  name: "hono-cursor-pagination",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "regex-shape" as const,
  fixturePath: "playground/hono-api/",
  prompt: `Read the spec at playground/hono-api/specs/cursor-pagination.md and implement the feature described there. Follow the patterns already established in playground/hono-api/.`,
} as const;

const scenario: Scenario = {
  id: "SB-18" as ScenarioId,
  name: "hono-cursor-pagination",
  category: "implementation",
  family: "spec-impl",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const BASE = join(playgroundDir, "playground/hono-api");
    const ORIG = join(PLAYGROUND_SRC, "hono-api");
    const items = await readOrEmpty(join(BASE, "src/routes/items.ts"));
    const origItems = await readFile(join(ORIG, "src/routes/items.ts"), "utf-8");
    const schema = await readOrEmpty(join(BASE, "schema.sql"));
    const origSchema = await readFile(join(ORIG, "schema.sql"), "utf-8");
    const users = await readOrEmpty(join(BASE, "src/routes/users.ts"));
    const origUsers = await readFile(join(ORIG, "src/routes/users.ts"), "utf-8");
    const sessions = await readOrEmpty(join(BASE, "src/routes/sessions.ts"));
    const origSessions = await readFile(join(ORIG, "src/routes/sessions.ts"), "utf-8");
    const readSpec = toolCalls.some(
      (c) => c.name === "read" && c.args.includes("cursor-pagination.md")
    );

    return rubricToEvaluation(
      {
        correctness: [
          { name: "edited items.ts", pass: items !== origItems, weight: 0.5 },
          { name: "response includes nextCursor", pass: /nextCursor/.test(items), weight: 1 },
          { name: "query uses LIMIT", pass: /LIMIT\s+\?/i.test(items), weight: 0.5 },
          { name: "filters by cursor (id < ?)", pass: /id\s*<\s*\?/.test(items), weight: 1 },
        ],
        scope: [
          { name: "did not modify schema.sql", pass: schema === origSchema, weight: 1 },
          {
            name: "did not modify users.ts or sessions.ts",
            pass: users === origUsers && sessions === origSessions,
            weight: 1,
          },
        ],
        pattern: [
          {
            name: "keeps deleted_at IS NULL filter",
            pass: /deleted_at\s+IS\s+NULL/i.test(items),
            weight: 0.5,
          },
          {
            name: "keeps ORDER BY id DESC",
            pass: /ORDER\s+BY\s+id\s+DESC/i.test(items),
            weight: 0.5,
          },
          { name: "validates input via AppError", pass: /AppError/.test(items), weight: 0.5 },
          { name: "caps limit at 100", pass: /100/.test(items), weight: 0.5 },
        ],
        verification: [{ name: "read the spec file", pass: readSpec, weight: 1 }],
        cleanup: [
          { name: "no added comments", pass: noAddedComments(items, origItems), weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(items), weight: 1 },
        ],
      },
      {
        pass: "Added cursor pagination with correct response shape and preserved filters.",
        partial: "Partial implementation — missing cursor filter, validation, or limit cap.",
        fail: "Did not implement cursor pagination correctly.",
      }
    );
  },
};

export default scenario;
