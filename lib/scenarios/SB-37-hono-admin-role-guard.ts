import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { noConsoleLog, readOrEmpty, onlyChangedFiles } from "./_shared/helpers.js";
import { runHiddenTests, importsOf } from "./_shared/evaluators/index.js";

const PROMPT = `Read the spec at playground/hono-api/specs/admin-user-list.md and implement it. Follow the patterns already established in playground/hono-api/. You can run the public tests at playground/hono-api/tests/sb-37-admin-user-list.test.ts.`;

export const meta = {
  id: "SB-37",
  name: "hono-admin-role-guard",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/hono-api/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-37" as ScenarioId,
  name: "hono-admin-role-guard",
  category: "implementation",
  family: "spec-impl",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, "playground/hono-api");

    // Behavioral signal: hidden tests assert guard ordering (401 before 403),
    // non-admins never see the list, and password_hash never leaks.
    const hidden = await runHiddenTests("SB-37", fixtureDir);
    const correct = hidden.total > 0 && hidden.rate === 1;

    const adminPath = join(fixtureDir, "src/routes/admin.ts");
    const admin = await readOrEmpty(adminPath);
    const index = await readOrEmpty(join(fixtureDir, "src/index.ts"));
    const adminExists = admin.length > 0;

    const readSpec = toolCalls.some((c) => c.name === "read" && c.args.includes("admin-user-list.md"));

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/hono-api/src/routes/admin.ts", "playground/hono-api/src/index.ts"],
    });

    // AST: import comes from the existing auth module (no reinvented guard).
    const importsAuth = adminExists && importsOf(adminPath).some((m) => m.endsWith("lib/auth"));
    // Guards are passed as Hono middleware (identifier references, not calls),
    // so detect them as references against the auth import being present.
    const usesRequireAdmin = importsAuth && /\brequireAdmin\b/.test(admin);
    const usesRequireUser = importsAuth && /\brequireUser\b/.test(admin);
    // No inline role re-implementation (the anti-pattern this guards against).
    const noInlineRoleCheck = !/role\s*[!=]==?\s*["'`]admin["'`]/.test(admin);
    const mountedInIndex = /adminRoutes/.test(index) && /app\.route\(/.test(index);
    const noPasswordHashSelected = !/password_hash/.test(admin) && !/SELECT\s+\*/i.test(admin);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "admin guard behavior test passes",
            pass: correct,
            weight: 3,
            detail: `${hidden.passed}/${hidden.total} hidden assertions passed`,
          },
        ],
        scope: [
          {
            name: "only created admin.ts and edited index.ts",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          { name: "reuses requireUser guard (401 ordering)", pass: usesRequireUser, weight: 1 },
          { name: "reuses requireAdmin guard", pass: usesRequireAdmin, weight: 0.25 },
          { name: "imports from lib/auth (no reinvented guard)", pass: importsAuth, weight: 0.25 },
          { name: "no inline role check reimplementation", pass: noInlineRoleCheck, weight: 0.25 },
          { name: "mounted adminRoutes in index.ts", pass: mountedInIndex, weight: 0.25 },
        ],
        verification: [{ name: "read the spec file", pass: readSpec, weight: 1 }],
        cleanup: [
          { name: "did not select password_hash", pass: noPasswordHashSelected, weight: 1 },
          { name: "no console.log in new admin route", pass: noConsoleLog(admin), weight: 1 },
        ],
      },
      {
        pass: "Admin route reuses both guards, ordering correct, no leak.",
        partial: "Endpoint exists but guard reuse/ordering incomplete.",
        fail: "Did not implement an admin-guarded endpoint correctly.",
      }
    );
  },
};

export default scenario;
