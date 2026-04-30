import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { checksToEvaluation } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import { PLAYGROUND_SRC, readOrEmpty } from "./_shared/helpers.js";

export const meta = {
  id: "SB-18",
  name: "hono-cursor-pagination",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  fixturePath: "playground/hono-api/",
  prompt: `Read the spec at playground/hono-api/specs/cursor-pagination.md and implement the feature described there. Follow the patterns already established in playground/hono-api/.`,
} as const;

const scenario: Scenario = {
  id: "SB-18" as ScenarioId,
  name: "hono-cursor-pagination",
  category: "implementation",
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

    const checks = [
      { name: "read the spec file", pass: readSpec },
      { name: "edited items.ts", pass: items !== origItems },
      { name: "response includes nextCursor", pass: /nextCursor/.test(items) },
      { name: "query uses LIMIT", pass: /LIMIT\s+\?/i.test(items) },
      { name: "filters by cursor (id < ?)", pass: /id\s*<\s*\?/.test(items) },
      {
        name: "keeps deleted_at IS NULL filter",
        pass: /deleted_at\s+IS\s+NULL/i.test(items),
      },
      { name: "keeps ORDER BY id DESC", pass: /ORDER\s+BY\s+id\s+DESC/i.test(items) },
      { name: "validates input via AppError", pass: /AppError/.test(items) },
      { name: "caps limit at 100", pass: /100/.test(items) },
      { name: "did not modify schema.sql", pass: schema === origSchema },
      { name: "did not modify users.ts", pass: users === origUsers },
      { name: "did not modify sessions.ts", pass: sessions === origSessions },
    ];

    return checksToEvaluation(checks, {
      pass: "Added cursor pagination with correct response shape and preserved filters.",
      partial: "Partial implementation — missing cursor filter, validation, or limit cap.",
      fail: "Did not implement cursor pagination correctly.",
    });
  },
};

export default scenario;
