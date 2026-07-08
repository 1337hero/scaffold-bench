import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Ms, ScenarioId } from "../schemas/brands.js";
import { classifyRuntimeError, runtimeErrorEvaluation } from "../scoring.ts";
import type { RuntimeOutput, ScenarioEvaluation } from "../scoring.ts";
import type { Scenario, ScenarioEvaluateInput } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  bunAvailable,
  createSkippedEvaluation,
  noConsoleLog,
  readOrEmpty,
  runBunTest,
  onlyChangedFiles,
} from "./_shared/helpers.js";

const PROMPT = `Read the spec at playground/hono-api/specs/audit-log.md and implement the feature described there. Follow the patterns already established in playground/hono-api/.`;

export const meta = {
  id: "SB-16",
  name: "hono-audit-log",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/hono-api/",
  prompt: PROMPT,
} as const;

async function evaluateSB16(input: ScenarioEvaluateInput): Promise<ScenarioEvaluation> {
  const { playgroundDir } = input;
  const fixtureDir = join(playgroundDir, "playground/hono-api");

  const testRun = await runBunTest(fixtureDir, "tests/sb-16-audit-log.test.ts");
  const testsPass = testRun.pass;

  const BASE = fixtureDir;
  const audit = await readOrEmpty(join(BASE, "src/lib/audit.ts"));
  const admin = await readOrEmpty(join(BASE, "src/routes/admin.ts"));
  const schema = await readOrEmpty(join(BASE, "schema.sql"));
  const index = await readOrEmpty(join(BASE, "src/index.ts"));
  const ORIG = join(PLAYGROUND_SRC, "hono-api");
  const origIndex = await readFile(join(ORIG, "src/index.ts"), "utf-8").catch(() => "");
  const readSpec = input.toolCalls.some(
    (c) => c.name === "read" && c.args.includes("audit-log.md")
  );

  const scope = await onlyChangedFiles({
    playgroundDir,
    allowedPaths: [
      "playground/hono-api/src/lib/audit.ts",
      "playground/hono-api/src/routes/admin.ts",
      "playground/hono-api/src/index.ts",
      "playground/hono-api/schema.sql",
    ],
  });

  return rubricToEvaluation(
    {
      correctness: [
        {
          name: "bun tests pass",
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
          name: "audit.ts exports logAudit",
          pass: /export\s+function\s+logAudit|export\s+(const|let)\s+logAudit/.test(audit),
          weight: 0.5,
        },
        {
          name: "admin.ts exports adminRoutes",
          pass: /export\s+(const|let)\s+adminRoutes/.test(admin),
          weight: 0.5,
        },
        {
          name: "index.ts mounts adminRoutes",
          pass: index !== origIndex && /adminRoutes/.test(index),
          weight: 0.5,
        },
        {
          name: "schema.sql adds index on audit_events",
          pass: /CREATE\s+INDEX[^;]*audit_events/i.test(schema),
          weight: 0.5,
        },
      ],
      verification: [{ name: "read the spec file", pass: readSpec, weight: 1 }],
      cleanup: [
        { name: "no console.log added in audit.ts", pass: noConsoleLog(audit), weight: 1 },
        { name: "no console.log added in admin.ts", pass: noConsoleLog(admin), weight: 1 },
      ],
    },
    {
      pass: "All tests pass with audit helper, admin route, schema, and wiring.",
      partial: "Some tests fail, or implementation pieces missing.",
      fail: "Did not implement the audit log feature.",
    }
  );
}

const scenario: Scenario = {
  id: "SB-16" as ScenarioId,
  name: "hono-audit-log",
  category: "implementation",
  family: "spec-impl",
  prompt: PROMPT,
  async execute(ctx) {
    const { runtime, workDir, timeoutMs, onRuntimeEvent, runtimeOverrides } = ctx;

    if (!bunAvailable()) {
      const output: RuntimeOutput = {
        stdout: "",
        toolCalls: [],
        wallTimeMs: 0 as Ms,
        scenarioMetrics: { skipped: true, reason: "bun-not-on-path" },
      };
      return {
        output,
        evaluation: createSkippedEvaluation("bun on PATH", "SKIPPED: bun not found on PATH"),
      };
    }

    const runStartedAt = performance.now();
    let output: RuntimeOutput;
    try {
      output = await runtime.run({
        workDir,
        prompt: PROMPT,
        timeoutMs,
        onEvent: onRuntimeEvent,
        ...runtimeOverrides,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      output = {
        stdout: "",
        toolCalls: [],
        wallTimeMs: Math.round(performance.now() - runStartedAt) as Ms,
        error: `CRASH: ${msg}`,
      };
    }

    if (output.error) {
      const classification = classifyRuntimeError(output.error);
      return {
        output: {
          ...output,
          scenarioMetrics: {
            ...output.scenarioMetrics,
            runtimeErrorKind: classification.kind,
            scoreExempt: classification.scoreExempt,
          },
        },
        evaluation: runtimeErrorEvaluation(output.error, 10),
      };
    }

    const evaluation = await evaluateSB16({
      stdout: output.stdout,
      playgroundDir: workDir,
      toolCalls: output.toolCalls,
      wallTimeMs: output.wallTimeMs,
      firstTokenMs: output.firstTokenMs,
      turnWallTimes: output.turnWallTimes,
      turnFirstTokenMs: output.turnFirstTokenMs,
      modelMetrics: output.modelMetrics,
      scenarioMetrics: output.scenarioMetrics,
    });

    return { output, evaluation };
  },
  evaluate: evaluateSB16,
};

export default scenario;
