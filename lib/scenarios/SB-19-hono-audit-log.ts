import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { checksToEvaluation } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import { PLAYGROUND_SRC, readOrEmpty } from "./_shared/helpers.js";

export const meta = {
  id: "SB-19",
  name: "hono-audit-log",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  fixturePath: "playground/hono-api/",
  prompt: `Read the spec at playground/hono-api/specs/audit-log.md and implement the feature described there. Follow the patterns already established in playground/hono-api/.`,
} as const;

const scenario: Scenario = {
  id: "SB-19" as ScenarioId,
  name: "hono-audit-log",
  category: "implementation",
  family: "spec-impl",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const BASE = join(playgroundDir, "playground/hono-api");
    const ORIG = join(PLAYGROUND_SRC, "hono-api");

    const audit = await readOrEmpty(join(BASE, "src/lib/audit.ts"));
    const admin = await readOrEmpty(join(BASE, "src/routes/admin.ts"));
    const schema = await readOrEmpty(join(BASE, "schema.sql"));
    const origSchema = await readFile(join(ORIG, "schema.sql"), "utf-8");
    const index = await readOrEmpty(join(BASE, "src/index.ts"));
    const origIndex = await readFile(join(ORIG, "src/index.ts"), "utf-8");
    const users = await readOrEmpty(join(BASE, "src/routes/users.ts"));
    const origUsers = await readFile(join(ORIG, "src/routes/users.ts"), "utf-8");
    const items = await readOrEmpty(join(BASE, "src/routes/items.ts"));
    const origItems = await readFile(join(ORIG, "src/routes/items.ts"), "utf-8");
    const sessions = await readOrEmpty(join(BASE, "src/routes/sessions.ts"));
    const origSessions = await readFile(join(ORIG, "src/routes/sessions.ts"), "utf-8");

    const readSpec = toolCalls.some((c) => c.name === "read" && c.args.includes("audit-log.md"));

    const checks = [
      { name: "read the spec file", pass: readSpec },
      { name: "created src/lib/audit.ts", pass: audit.length > 0 },
      {
        name: "audit.ts exports logAudit",
        pass: /export\s+function\s+logAudit|export\s+(const|let)\s+logAudit/.test(audit),
      },
      {
        name: "logAudit inserts into audit_events",
        pass: /INSERT\s+INTO\s+audit_events/i.test(audit),
      },
      { name: "created src/routes/admin.ts", pass: admin.length > 0 },
      {
        name: "admin.ts exports adminRoutes",
        pass: /export\s+(const|let)\s+adminRoutes/.test(admin),
      },
      { name: "admin.ts uses requireAdmin", pass: /requireAdmin/.test(admin) },
      { name: "admin.ts calls logAudit", pass: /logAudit\s*\(/.test(admin) },
      {
        name: "schema.sql adds audit_events table",
        pass: schema !== origSchema && /CREATE\s+TABLE[^;]*audit_events/i.test(schema),
      },
      {
        name: "schema.sql adds index on audit_events",
        pass: /CREATE\s+INDEX[^;]*audit_events/i.test(schema),
      },
      {
        name: "index.ts mounts adminRoutes",
        pass: index !== origIndex && /adminRoutes/.test(index),
      },
      { name: "did not modify users.ts", pass: users === origUsers },
      { name: "did not modify items.ts", pass: items === origItems },
      { name: "did not modify sessions.ts", pass: sessions === origSessions },
    ];

    return checksToEvaluation(checks, {
      pass: "Implemented audit helper, admin route, schema, and wiring with correct patterns.",
      partial: "Partial implementation — audit mechanism or wiring incomplete.",
      fail: "Did not implement the audit log feature.",
    });
  },
};

export default scenario;
