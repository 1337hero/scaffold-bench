import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { PLAYGROUND_SRC, noConsoleLog, readOrEmpty } from "./_shared/helpers.js";

export const meta = {
  id: "SB-17",
  name: "hono-admin-password-reset",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "regex-shape" as const,
  fixturePath: "playground/hono-api/",
  prompt: `Read the spec at playground/hono-api/specs/admin-password-reset.md and implement the feature described there. Follow the patterns already established in playground/hono-api/.`,
} as const;

const scenario: Scenario = {
  id: "SB-17" as ScenarioId,
  name: "hono-admin-password-reset",
  category: "implementation",
  family: "spec-impl",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const BASE = join(playgroundDir, "playground/hono-api");
    const ORIG = join(PLAYGROUND_SRC, "hono-api");
    const schema = await readOrEmpty(join(BASE, "schema.sql"));
    const origSchema = await readFile(join(ORIG, "schema.sql"), "utf-8");
    const index = await readOrEmpty(join(BASE, "src/index.ts"));
    const origIndex = await readFile(join(ORIG, "src/index.ts"), "utf-8");
    const resetRoute = await readOrEmpty(join(BASE, "src/routes/password-resets.ts"));
    const users = await readOrEmpty(join(BASE, "src/routes/users.ts"));
    const origUsers = await readFile(join(ORIG, "src/routes/users.ts"), "utf-8");
    const items = await readOrEmpty(join(BASE, "src/routes/items.ts"));
    const origItems = await readFile(join(ORIG, "src/routes/items.ts"), "utf-8");
    const readSpec = toolCalls.some(
      (c) => c.name === "read" && c.args.includes("admin-password-reset.md")
    );

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "created src/routes/password-resets.ts",
            pass: resetRoute.length > 0,
            weight: 0.5,
          },
          {
            name: "exports adminPasswordResetsRoutes",
            pass: /export\s+(const|let)\s+adminPasswordResetsRoutes/.test(resetRoute),
            weight: 0.5,
          },
          {
            name: "exports passwordResetsRoutes",
            pass: /export\s+(const|let)\s+passwordResetsRoutes/.test(resetRoute),
            weight: 0.5,
          },
          {
            name: "schema.sql adds password_resets table",
            pass: schema !== origSchema && /CREATE\s+TABLE[^;]*password_resets/i.test(schema),
            weight: 0.5,
          },
          {
            name: "invalidates sessions on confirm",
            pass: /DELETE\s+FROM\s+sessions/i.test(resetRoute),
            weight: 0.5,
          },
          {
            name: "admin route uses requireAdmin",
            pass: /requireAdmin/.test(resetRoute),
            weight: 0.5,
          },
          {
            name: "password_resets has used_at column",
            pass: /password_resets[\s\S]*?used_at/i.test(schema),
            weight: 0.5,
          },
          {
            name: "password_resets has expires_at column",
            pass: /password_resets[\s\S]*?expires_at/i.test(schema),
            weight: 0.5,
          },
        ],
        scope: [
          { name: "did not modify users.ts", pass: users === origUsers, weight: 1 },
          { name: "did not modify items.ts", pass: items === origItems, weight: 1 },
        ],
        pattern: [
          {
            name: "uses AppError from lib/errors",
            pass: /AppError/.test(resetRoute) && /from\s+["'][^"']*errors["']/.test(resetRoute),
            weight: 1,
          },
          {
            name: "index.ts mounts both routers",
            pass:
              index !== origIndex &&
              /adminPasswordResetsRoutes/.test(index) &&
              /passwordResetsRoutes/.test(index),
            weight: 1,
          },
        ],
        verification: [{ name: "read the spec file", pass: readSpec, weight: 1 }],
        cleanup: [
          { name: "no console.log added", pass: noConsoleLog(resetRoute), weight: 1 },
          {
            name: "no commented-out code",
            pass: !/^\s*\/\/.*(TODO|FIXME|XXX)/m.test(resetRoute),
            weight: 1,
          },
        ],
      },
      {
        pass: "Implemented admin reset flow with correct file layout, patterns, and session invalidation.",
        partial: "Partial implementation — pieces missing (tables, invalidation, or patterns).",
        fail: "Did not produce a workable implementation.",
      }
    );
  },
};

export default scenario;
