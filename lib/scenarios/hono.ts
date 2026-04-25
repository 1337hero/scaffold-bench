import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { checksToEvaluation } from "../scoring.ts";
import type { Scenario } from "./types.js";
import { PLAYGROUND_SRC, readOrEmpty } from "./helpers.js";

export const honoScenarios: Scenario[] = [
  {
    id: "SB-17" as ScenarioId,
    name: "hono-admin-password-reset",
    category: "implementation",
    prompt:
      "Read the spec at playground/hono-api/specs/admin-password-reset.md and implement the feature described there. Follow the patterns already established in playground/hono-api/.",
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

      const checks = [
        { name: "read the spec file", pass: readSpec },
        { name: "created src/routes/password-resets.ts", pass: resetRoute.length > 0 },
        {
          name: "exports adminPasswordResetsRoutes",
          pass: /export\s+(const|let)\s+adminPasswordResetsRoutes/.test(resetRoute),
        },
        {
          name: "exports passwordResetsRoutes",
          pass: /export\s+(const|let)\s+passwordResetsRoutes/.test(resetRoute),
        },
        {
          name: "schema.sql adds password_resets table",
          pass: schema !== origSchema && /CREATE\s+TABLE[^;]*password_resets/i.test(schema),
        },
        {
          name: "password_resets has used_at column",
          pass: /password_resets[\s\S]*?used_at/i.test(schema),
        },
        {
          name: "password_resets has expires_at column",
          pass: /password_resets[\s\S]*?expires_at/i.test(schema),
        },
        {
          name: "index.ts mounts both routers",
          pass:
            index !== origIndex &&
            /adminPasswordResetsRoutes/.test(index) &&
            /passwordResetsRoutes/.test(index),
        },
        {
          name: "uses AppError from lib/errors",
          pass: /AppError/.test(resetRoute) && /from\s+["'][^"']*errors["']/.test(resetRoute),
        },
        {
          name: "admin route uses requireAdmin",
          pass: /requireAdmin/.test(resetRoute),
        },
        {
          name: "invalidates sessions on confirm",
          pass: /DELETE\s+FROM\s+sessions/i.test(resetRoute),
        },
        { name: "did not modify users.ts", pass: users === origUsers },
        { name: "did not modify items.ts", pass: items === origItems },
      ];

      return checksToEvaluation(checks, {
        pass: "Implemented admin reset flow with correct file layout, patterns, and session invalidation.",
        partial: "Partial implementation — pieces missing (tables, invalidation, or patterns).",
        fail: "Did not produce a workable implementation.",
      });
    },
  },

  {
    id: "SB-18" as ScenarioId,
    name: "hono-cursor-pagination",
    category: "implementation",
    prompt:
      "Read the spec at playground/hono-api/specs/cursor-pagination.md and implement the feature described there. Follow the patterns already established in playground/hono-api/.",
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
  },

  {
    id: "SB-19" as ScenarioId,
    name: "hono-audit-log",
    category: "implementation",
    prompt:
      "Read the spec at playground/hono-api/specs/audit-log.md and implement the feature described there. Follow the patterns already established in playground/hono-api/.",
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
  },

  {
    id: "SB-20" as ScenarioId,
    name: "hono-soft-delete-restore",
    category: "implementation",
    prompt:
      "Read the spec at playground/hono-api/specs/soft-delete-restore.md and implement the feature described there. Follow the patterns already established in playground/hono-api/.",
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
  },

  {
    id: "SB-21" as ScenarioId,
    name: "hono-fix-n-plus-1",
    category: "implementation",
    prompt:
      "Read the spec at playground/hono-api/specs/fix-n-plus-1.md and implement the fix described there. Follow the patterns already established in playground/hono-api/.",
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
        (c) => c.name === "read" && c.args.includes("fix-n-plus-1.md")
      );

      const stillHasPerRowQuery = /SELECT\s+email\s+FROM\s+users\s+WHERE\s+id\s*=\s*\?/i.test(
        items
      );
      const hasPost = /itemsRoutes\.post\(/.test(items);
      const hasDelete = /itemsRoutes\.delete\(/.test(items);

      const checks = [
        { name: "read the spec file", pass: readSpec },
        { name: "edited items.ts", pass: items !== origItems },
        { name: "uses JOIN on users table", pass: /JOIN\s+users/i.test(items) },
        { name: "still selects owner_email in response", pass: /owner_email/.test(items) },
        { name: "removed per-row owner query", pass: !stillHasPerRowQuery },
        {
          name: "keeps deleted_at IS NULL filter",
          pass: /deleted_at\s+IS\s+NULL/i.test(items),
        },
        { name: "keeps ORDER BY id DESC", pass: /ORDER\s+BY\s+id\s+DESC/i.test(items) },
        { name: "preserved POST /items handler", pass: hasPost },
        { name: "preserved DELETE handler", pass: hasDelete },
        { name: "did not modify schema.sql", pass: schema === origSchema },
        { name: "did not modify users.ts", pass: users === origUsers },
        { name: "did not modify sessions.ts", pass: sessions === origSessions },
      ];

      return checksToEvaluation(checks, {
        pass: "Replaced N+1 with a JOIN and preserved response shape and other handlers.",
        partial: "Partial fix — still has per-row query, or touched unrelated code.",
        fail: "Did not fix the N+1 or broke the route.",
      });
    },
  },
];
