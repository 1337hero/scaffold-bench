import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { PLAYGROUND_SRC, noAddedComments, noConsoleLog, readOrEmpty } from "./_shared/helpers.js";

export const meta = {
  id: "SB-20",
  name: "hono-soft-delete-restore",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "regex-shape" as const,
  fixturePath: "playground/hono-api/",
  prompt: `Read the spec at playground/hono-api/specs/soft-delete-restore.md and implement the feature described there. Follow the patterns already established in playground/hono-api/.`,
} as const;

const scenario: Scenario = {
  id: "SB-20" as ScenarioId,
  name: "hono-soft-delete-restore",
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
    const readSpec = toolCalls.some(
      (c) => c.name === "read" && c.args.includes("soft-delete-restore.md")
    );
    const hasGet = /itemsRoutes\.get\(\s*["']\/items["']/.test(items);
    const hasPost = /itemsRoutes\.post\(\s*["']\/items["']/.test(items);
    const hasDelete = /itemsRoutes\.delete\(\s*["']\/items\/:id["']/.test(items);

    return rubricToEvaluation(
      {
        correctness: [
          { name: "edited items.ts", pass: items !== origItems, weight: 0.5 },
          {
            name: "added restore route",
            pass: /itemsRoutes\.post\(\s*["']\/items\/:id\/restore["']/.test(items),
            weight: 1,
          },
          {
            name: "clears deleted_at on restore",
            pass: /deleted_at\s*=\s*NULL/i.test(items),
            weight: 1,
          },
          { name: "uses AppError for error responses", pass: /AppError/.test(items), weight: 0.5 },
        ],
        scope: [
          { name: "did not modify schema.sql", pass: schema === origSchema, weight: 1 },
          { name: "did not modify users.ts", pass: users === origUsers, weight: 1 },
        ],
        pattern: [
          { name: "preserved GET /items handler", pass: hasGet, weight: 0.5 },
          { name: "preserved POST /items handler", pass: hasPost, weight: 0.5 },
          { name: "preserved DELETE /items/:id handler", pass: hasDelete, weight: 0.5 },
          {
            name: "uses not_deleted code on already-active",
            pass: /not_deleted/.test(items),
            weight: 0.5,
          },
        ],
        verification: [{ name: "read the spec file", pass: readSpec, weight: 1 }],
        cleanup: [
          { name: "no added comments", pass: noAddedComments(items, origItems), weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(items), weight: 1 },
        ],
      },
      {
        pass: "Added restore route using existing soft-delete column and preserved other handlers.",
        partial:
          "Partial implementation — missing correct error codes, or touched unrelated handlers.",
        fail: "Did not implement the restore endpoint correctly.",
      }
    );
  },
};

export default scenario;
