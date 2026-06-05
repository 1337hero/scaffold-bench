import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { noConsoleLog, readOrEmpty, onlyChangedFiles } from "./_shared/helpers.js";
import { runHiddenTests, importsOf } from "./_shared/evaluators/index.js";

const PROMPT = `Read the spec at playground/hono-api/specs/cors-csrf-hardening.md and implement it. Reuse Hono's first-party cors and csrf middleware — do not hand-roll header parsing — and do not break the existing same-origin tests. You can run the public tests at playground/hono-api/tests/sb-44-cors-csrf.test.ts.`;

export const meta = {
  id: "SB-44",
  name: "hono-cors-csrf",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/hono-api/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-44" as ScenarioId,
  name: "hono-cors-csrf",
  category: "implementation",
  family: "spec-impl",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, "playground/hono-api");
    const securityPath = join(fixtureDir, "src/lib/security.ts");

    // Behavioral signal: hidden tests assert CORS reflects only the trusted
    // origin with credentials, CSRF blocks a foreign-origin form POST, and
    // no-Origin same-origin traffic still works.
    const hidden = await runHiddenTests("SB-44", fixtureDir);
    const correct = hidden.total > 0 && hidden.rate === 1;

    const security = await readOrEmpty(securityPath);
    const index = await readOrEmpty(join(fixtureDir, "src/index.ts"));
    const securityExists = security.length > 0;

    const readSpec = toolCalls.some(
      (c) => c.name === "read" && c.args.includes("cors-csrf-hardening.md")
    );

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [
        "playground/hono-api/src/lib/security.ts",
        "playground/hono-api/src/index.ts",
        "playground/hono-api/src/lib/errors.ts",
      ],
    });

    const errors = await readOrEmpty(join(fixtureDir, "src/lib/errors.ts"));
    const honorsHttpException = /HTTPException/.test(errors) && /getResponse\s*\(/.test(errors);

    const imports = securityExists ? importsOf(securityPath) : [];
    const usesHonoCors = imports.some((m) => m === "hono/cors") && /\bcors\s*\(/.test(security);
    const usesHonoCsrf = imports.some((m) => m === "hono/csrf") && /\bcsrf\s*\(/.test(security);
    const pinsOrigin = /https:\/\/app\.example\.com/.test(security);
    const credentials = /credentials\s*:\s*true/.test(security);
    const wiredInIndex =
      /corsMiddleware/.test(index) && /csrfMiddleware/.test(index) && /app\.use\(/.test(index);
    // Anti-pattern: hand-rolling header parsing instead of the middleware.
    const noHandRolled = !/setHeader|headers\.set\(\s*["'`]Access-Control/i.test(security);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "CORS/CSRF behavior holds; same-origin unaffected",
            pass: correct,
            weight: 3,
            detail: `${hidden.passed}/${hidden.total} hidden assertions passed`,
          },
        ],
        scope: [
          {
            name: "only created security.ts and edited index.ts",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          { name: "reuses hono/cors", pass: usesHonoCors, weight: 0.5 },
          { name: "reuses hono/csrf", pass: usesHonoCsrf, weight: 0.5 },
          { name: "pins the trusted origin", pass: pinsOrigin, weight: 0.5 },
          { name: "wired both middleware into index.ts", pass: wiredInIndex, weight: 0.25 },
          { name: "error handler honors HTTPException", pass: honorsHttpException, weight: 0.25 },
        ],
        verification: [{ name: "read the spec file", pass: readSpec, weight: 1 }],
        cleanup: [
          { name: "credentials enabled + no hand-rolled CORS headers", pass: credentials && noHandRolled, weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(security), weight: 1 },
        ],
      },
      {
        pass: "Reused hono cors+csrf, pinned the trusted origin, kept same-origin traffic working.",
        partial: "Headers set but origin/credentials or CSRF behavior is off.",
        fail: "Did not harden CORS/CSRF correctly.",
      }
    );
  },
};

export default scenario;
