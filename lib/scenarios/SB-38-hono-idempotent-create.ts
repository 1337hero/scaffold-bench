import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  noConsoleLog,
  noAddedComments,
  readOrEmpty,
  onlyChangedFiles,
} from "./_shared/helpers.js";
import { runHiddenTests } from "./_shared/evaluators/index.js";

const PROMPT = `Read the spec at playground/hono-api/specs/idempotent-create-item.md and implement it. Follow the patterns already established in playground/hono-api/. You can run the public tests at playground/hono-api/tests/sb-38-idempotent-create.test.ts.`;

export const meta = {
  id: "SB-38",
  name: "hono-idempotent-create",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/hono-api/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-38" as ScenarioId,
  name: "hono-idempotent-create",
  category: "implementation",
  family: "spec-impl",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, "playground/hono-api");
    const ORIG = join(PLAYGROUND_SRC, "hono-api");

    // Behavioral signal: hidden tests retry POST /items with one key and assert
    // exactly one row, stable id, and per-user key scoping.
    const hidden = await runHiddenTests("SB-38", fixtureDir);
    const correct = hidden.total > 0 && hidden.rate === 1;

    const items = await readOrEmpty(join(fixtureDir, "src/routes/items.ts"));
    const origItems = await readFile(join(ORIG, "src/routes/items.ts"), "utf-8").catch(() => "");
    const schema = await readOrEmpty(join(fixtureDir, "schema.sql"));

    const readSpec = toolCalls.some(
      (c) => c.name === "read" && c.args.includes("idempotent-create-item.md")
    );

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/hono-api/schema.sql", "playground/hono-api/src/routes/items.ts"],
    });

    const addedTable = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+idempotency_keys/i.test(schema);
    const hasUniqueScope =
      /PRIMARY\s+KEY\s*\(\s*user_id\s*,\s*key/i.test(schema) ||
      /UNIQUE\s*\(\s*user_id\s*,\s*key/i.test(schema);
    const readsHeader = /Idempotency-Key/i.test(items);
    const keptGet = /SELECT[\s\S]*FROM\s+items[\s\S]*deleted_at\s+IS\s+NULL/i.test(items);
    const keptDelete = /itemsRoutes\.delete\(/.test(items);
    // Schema compatibility: did NOT rewrite the pre-existing table definitions.
    const preservedExistingTables =
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+users/i.test(schema) &&
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+sessions/i.test(schema) &&
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+items/i.test(schema);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "idempotency behavior test passes",
            pass: correct,
            weight: 3,
            detail: `${hidden.passed}/${hidden.total} hidden assertions passed`,
          },
        ],
        scope: [
          {
            name: "only edited schema.sql and items.ts",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          { name: "added idempotency_keys table (IF NOT EXISTS)", pass: addedTable, weight: 0.75 },
          { name: "unique per (user, key)", pass: hasUniqueScope, weight: 1 },
          { name: "reads the Idempotency-Key header", pass: readsHeader, weight: 0.25 },
        ],
        verification: [{ name: "read the spec file", pass: readSpec, weight: 1 }],
        cleanup: [
          {
            name: "preserved GET /items and DELETE handlers",
            pass: keptGet && keptDelete,
            weight: 0.5,
          },
          {
            name: "schema migration kept existing tables compatible",
            pass: preservedExistingTables,
            weight: 0.5,
          },
          { name: "no console.log added", pass: noConsoleLog(items), weight: 0.5 },
          {
            name: "no unrelated comment churn",
            pass: noAddedComments(items, origItems),
            weight: 0.5,
          },
        ],
      },
      {
        pass: "Retries dedupe via a per-user idempotency table; existing tables untouched.",
        partial: "Idempotency partially works or schema/scope issues.",
        fail: "Did not make POST /items idempotent.",
      }
    );
  },
};

export default scenario;
