import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { PLAYGROUND_SRC, readOrEmpty } from "./_shared/helpers.js";

export const meta = {
  id: "SB-21",
  name: "hono-fix-n-plus-1",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  fixturePath: "playground/hono-api/",
  prompt: `Read the spec at playground/hono-api/specs/fix-n-plus-1.md and implement the fix described there. Follow the patterns already established in playground/hono-api/.`,
} as const;

const scenario: Scenario = {
  id: "SB-21" as ScenarioId,
  name: "hono-fix-n-plus-1",
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
    const readSpec = toolCalls.some((c) => c.name === "read" && c.args.includes("fix-n-plus-1.md"));
    const stillHasPerRowQuery = /SELECT\s+email\s+FROM\s+users\s+WHERE\s+id\s*=\s*\?/i.test(items);
    const hasPost = /itemsRoutes\.post\(/.test(items);
    const hasDelete = /itemsRoutes\.delete\(/.test(items);

    return rubricToEvaluation({
      correctness: [
        { name: "edited items.ts", pass: items !== origItems, weight: 0.5 },
        { name: "uses JOIN on users table", pass: /JOIN\s+users/i.test(items), weight: 1 },
        { name: "removed per-row owner query", pass: !stillHasPerRowQuery, weight: 1 },
        { name: "still selects owner_email in response", pass: /owner_email/.test(items), weight: 0.5 },
      ],
      scope: [
        { name: "did not modify schema.sql", pass: schema === origSchema, weight: 1 },
        { name: "did not modify users.ts or sessions.ts", pass: users === origUsers && sessions === origSessions, weight: 1 },
      ],
      pattern: [
        { name: "keeps deleted_at IS NULL filter", pass: /deleted_at\s+IS\s+NULL/i.test(items), weight: 1 },
        { name: "keeps ORDER BY id DESC", pass: /ORDER\s+BY\s+id\s+DESC/i.test(items), weight: 1 },
      ],
      verification: [
        { name: "read the spec file", pass: readSpec, weight: 1 },
      ],
      cleanup: [
        { name: "preserved POST /items handler", pass: hasPost, weight: 1 },
        { name: "preserved DELETE handler", pass: hasDelete, weight: 1 },
      ],
    }, {
      pass: "Replaced N+1 with a JOIN and preserved response shape and other handlers.",
      partial: "Partial fix — still has per-row query, or touched unrelated code.",
      fail: "Did not fix the N+1 or broke the route.",
    });
  },
};

export default scenario;
