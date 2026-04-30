import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { checksToEvaluation } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import { PLAYGROUND_SRC, readOrEmpty } from "./_shared/helpers.js";

export const meta = {
  id: "SB-20",
  name: "hono-soft-delete-restore",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
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

    const checks = [
      { name: "read the spec file", pass: readSpec },
      { name: "edited items.ts", pass: items !== origItems },
      {
        name: "added restore route",
        pass: /itemsRoutes\.post\(\s*["']\/items\/:id\/restore["']/.test(items),
      },
      { name: "clears deleted_at on restore", pass: /deleted_at\s*=\s*NULL/i.test(items) },
      { name: "uses AppError for error responses", pass: /AppError/.test(items) },
      { name: "uses not_deleted code on already-active", pass: /not_deleted/.test(items) },
      { name: "preserved GET /items handler", pass: hasGet },
      { name: "preserved POST /items handler", pass: hasPost },
      { name: "preserved DELETE /items/:id handler", pass: hasDelete },
      { name: "did not modify schema.sql", pass: schema === origSchema },
      { name: "did not modify users.ts", pass: users === origUsers },
    ];

    return checksToEvaluation(checks, {
      pass: "Added restore route using existing soft-delete column and preserved other handlers.",
      partial:
        "Partial implementation — missing correct error codes, or touched unrelated handlers.",
      fail: "Did not implement the restore endpoint correctly.",
    });
  },
};

export default scenario;
