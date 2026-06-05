import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  noAddedComments,
  noConsoleLog,
  readOrEmpty,
  onlyChangedFiles,
} from "./_shared/helpers.js";
import { runBunTest } from "./_shared/evaluators/index.js";

const PROMPT = `Read the spec at playground/hono-api/specs/fix-n-plus-1.md and implement the fix described there. Follow the patterns already established in playground/hono-api/.`;

export const meta = {
  id: "SB-18",
  name: "hono-fix-n-plus-1",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/hono-api/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-18" as ScenarioId,
  name: "hono-fix-n-plus-1",
  category: "implementation",
  family: "spec-impl",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, "playground/hono-api");
    const ORIG = join(PLAYGROUND_SRC, "hono-api");

    // Behavioral signal: the query-count test fails under N+1 (1 + N per-row
    // owner lookups) and passes only when a single JOIN serves the list.
    const testRun = await runBunTest(fixtureDir, "tests/sb-18-fix-n-plus-1.test.ts");
    const testsPass = testRun.pass;

    const items = await readOrEmpty(join(fixtureDir, "src/routes/items.ts"));
    const origItems = await readFile(join(ORIG, "src/routes/items.ts"), "utf-8").catch(() => "");
    const readSpec = toolCalls.some((c) => c.name === "read" && c.args.includes("fix-n-plus-1.md"));
    const stillHasPerRowQuery = /SELECT\s+email\s+FROM\s+users\s+WHERE\s+id\s*=\s*\?/i.test(items);
    const hasPost = /itemsRoutes\.post\(/.test(items);
    const hasDelete = /itemsRoutes\.delete\(/.test(items);

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/hono-api/src/routes/items.ts"],
    });

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "query-count test passes (no N+1)",
            pass: testsPass,
            weight: 3,
            detail: testsPass ? undefined : testRun.stdout + "\n" + testRun.stderr,
          },
        ],
        scope: [
          {
            name: "only expected files changed",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "keeps deleted_at IS NULL filter",
            pass: /deleted_at\s+IS\s+NULL/i.test(items),
            weight: 0.25,
          },
          {
            name: "keeps ORDER BY id DESC",
            pass: /ORDER\s+BY\s+id\s+DESC/i.test(items),
            weight: 0.25,
          },
          { name: "preserved POST /items handler", pass: hasPost, weight: 0.25 },
          { name: "preserved DELETE handler", pass: hasDelete, weight: 0.25 },
          { name: "uses JOIN on users table", pass: /JOIN\s+users/i.test(items), weight: 0.5 },
          {
            name: "removed per-row owner query",
            pass: !stillHasPerRowQuery,
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
        pass: "Query-count test green, N+1 replaced with JOIN, other handlers preserved.",
        partial: "Some tests fail or still has per-row query.",
        fail: "Did not fix the N+1 or broke the route.",
      }
    );
  },
};

export default scenario;
