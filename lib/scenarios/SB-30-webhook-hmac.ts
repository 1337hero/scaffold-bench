import { join } from "node:path";
import type { Ms, ScenarioId } from "../schemas/brands.js";
import { classifyRuntimeError, runtimeErrorEvaluation } from "../scoring.ts";
import type { RuntimeOutput, ScenarioEvaluation } from "../scoring.ts";
import type { Scenario, ScenarioEvaluateInput } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  bunAvailable,
  createSkippedEvaluation,
  noConsoleLog,
  onlyChangedFiles,
  readOrEmpty,
  runBunTest,
} from "./_shared/helpers.js";

const PROMPT = `Implement the webhook handler described in \`playground/hono-api/specs/webhooks.md\`. The endpoint should be \`POST /webhooks/orders\`. Verify the \`X-Signature: sha256=<hmac>\` header, return 401 on mismatch, dedupe replayed events by \`event_id\`, and return 200 for replays.`;

export const meta = {
  id: "SB-30",
  name: "webhook-hmac",
  category: "implementation" as const,
  family: "spec-impl" as const,
  difficulty: "high" as const, // cognitive-load override (field mean inflated by strong-model sample)
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/hono-api/",
  prompt: PROMPT,
} as const;

async function evaluateSB30(input: ScenarioEvaluateInput): Promise<ScenarioEvaluation> {
  const { playgroundDir, toolCalls } = input;
  const fixtureDir = join(playgroundDir, "playground/hono-api");

  const testRun = await runBunTest(fixtureDir, "tests/sb-30-webhooks.test.ts");
  const webhookRoute = await readOrEmpty(join(fixtureDir, "src/routes/webhooks.ts"));
  const indexTs = await readOrEmpty(join(fixtureDir, "src/index.ts"));

  const usesTimingSafe = /timingSafeEqual/.test(webhookRoute) || /timing.safe/i.test(webhookRoute);
  const noStringEqual =
    !/[!=]==\s*expected/.test(webhookRoute) &&
    !/expected\s*[!=]==/.test(webhookRoute) &&
    !/sig\s*[!=]==\s*exp/.test(webhookRoute);

  const readSpec = toolCalls.some((c) => c.name === "read" && c.args.includes("webhooks.md"));

  const scope = await onlyChangedFiles({
    playgroundDir,
    allowedPaths: [
      "playground/hono-api/src/routes/webhooks.ts",
      "playground/hono-api/src/index.ts",
      "playground/hono-api/schema.sql",
    ],
  });

  return rubricToEvaluation(
    {
      correctness: [
        {
          name: "webhook test suite passes",
          pass: testRun.pass,
          weight: 3,
          detail: testRun.pass ? undefined : testRun.stdout + "\n" + testRun.stderr,
        },
      ],
      scope: [
        {
          name: "only webhook handler + index + schema changed",
          pass: scope.pass,
          weight: 2,
          detail: scope.detail,
        },
      ],
      pattern: [
        {
          name: "uses constant-time compare (timingSafeEqual)",
          pass: usesTimingSafe,
          weight: 1,
          detail: usesTimingSafe ? undefined : "no timingSafeEqual — vulnerable to timing attacks",
        },
        {
          name: "no === string comparison for HMAC",
          pass: noStringEqual,
          weight: 1,
          detail: noStringEqual ? undefined : "uses === to compare HMAC strings",
        },
      ],
      verification: [
        {
          name: "read webhook spec before writing",
          pass: readSpec,
          weight: 1,
        },
      ],
      cleanup: [
        {
          name: "no console.log in webhook handler",
          pass: noConsoleLog(webhookRoute),
          weight: 1,
        },
        {
          name: "webhook handler mounted in index.ts",
          pass: /webhooksRoutes/.test(indexTs) || /webhook/i.test(indexTs),
          weight: 1,
        },
      ],
    },
    {
      pass: "Webhook handler passes all tests with timing-safe compare and dedup.",
      partial: "Some webhook tests pass but timing safety or dedup missing.",
      fail: "Webhook handler not implemented or tests fail.",
    }
  );
}

const scenario: Scenario = {
  id: "SB-30" as ScenarioId,
  name: "webhook-hmac",
  category: "implementation",
  family: "spec-impl",
  difficulty: "high",
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

    const evaluation = await evaluateSB30({
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
  evaluate: evaluateSB30,
};

export default scenario;
