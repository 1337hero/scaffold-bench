import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { Ms, ScenarioId } from "../schemas/brands.js";
import { classifyRuntimeError, runtimeErrorEvaluation } from "../scoring.ts";
import type { RuntimeOutput, ScenarioEvaluation } from "../scoring.ts";
import type { Scenario, ScenarioEvaluateInput } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { createSkippedEvaluation, onlyChangedFiles } from "./_shared/helpers.js";
import { runPhp } from "./_shared/runners/php.js";
import { hasTool } from "./_shared/toolchain.js";

const PROMPT =
  "Members are getting a double discount at checkout — 19% instead of 10%. The cart total filter is in `playground/php-wp/inc/pricing.php` and it's also referenced in `functions.php`. Fix the discount application without rewriting the pricing logic.";

export const meta = {
  id: "SB-31",
  name: "woo-double-discount",
  category: "surgical-edit" as const,
  family: "bug-fix" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/php-wp/",
  requires: ["php"],
  prompt: PROMPT,
} as const;

const ENTRY_PHP = `<?php
require_once __DIR__ . '/wp-stubs.php';
require_once __DIR__ . '/inc/pricing.php';
require_once __DIR__ . '/functions.php';
echo get_cart_total(100);
`;

async function phpCartTotal(wpDir: string, wpStubsPath: string): Promise<number | null> {
  const pricingPhp = await readFile(join(wpDir, "inc/pricing.php"), "utf-8").catch(() => "");
  const functionsPhp = await readFile(join(wpDir, "functions.php"), "utf-8").catch(() => "");

  const result = await runPhp(
    "entry.php",
    {
      "entry.php": ENTRY_PHP,
      "inc/pricing.php": pricingPhp,
      "functions.php": functionsPhp,
    },
    wpStubsPath
  );
  if (!result.ok) return null;
  const val = parseFloat(result.stdout.trim());
  return Number.isFinite(val) ? val : null;
}

async function evaluateSB31(input: ScenarioEvaluateInput): Promise<ScenarioEvaluation> {
  const { playgroundDir, toolCalls } = input;
  const wpDir = join(playgroundDir, "playground/php-wp");
  const wpStubsPath = join(playgroundDir, "playground/php-wp/wp-stubs.php");
  const cartTotal = await phpCartTotal(wpDir, wpStubsPath);
  const exactlyNinety = cartTotal === 90;

  const functionsPhp = await readFile(join(wpDir, "functions.php"), "utf-8").catch(() => "");
  const pricingPhp = await readFile(join(wpDir, "inc/pricing.php"), "utf-8").catch(() => "");
  const combined = functionsPhp + pricingPhp;

  const usesRemoveFilter = /remove_filter\s*\(/.test(combined);
  const addFilterCount = (combined.match(/add_filter\s*\(\s*['"]cart_total['"]/g) ?? []).length;
  const singleRegistration = addFilterCount === 1 || usesRemoveFilter;

  const pricingUnchanged =
    /function\s+apply_member_discount/.test(pricingPhp) &&
    /return\s+\$total\s*\*\s*0\.9/.test(pricingPhp);

  const scope = await onlyChangedFiles({
    playgroundDir,
    allowedPaths: ["playground/php-wp/functions.php", "playground/php-wp/inc/pricing.php"],
  });

  const readBeforeEdit = toolCalls.some(
    (c) => c.name === "read" && (c.args.includes("pricing.php") || c.args.includes("functions.php"))
  );

  const noDebugOutput = !/var_dump\s*\(/.test(combined) && !/error_log\s*\(/.test(combined);

  return rubricToEvaluation(
    {
      correctness: [
        {
          name: "get_cart_total(100) returns exactly 90",
          pass: exactlyNinety,
          weight: 3,
          detail: exactlyNinety ? undefined : `got ${cartTotal}`,
        },
      ],
      scope: [
        {
          name: "only functions.php or pricing.php changed",
          pass: scope.pass,
          weight: 2,
          detail: scope.detail,
        },
      ],
      pattern: [
        {
          name: "uses remove_filter or single registration",
          pass: singleRegistration,
          weight: 1,
          detail: singleRegistration ? undefined : `add_filter cart_total count: ${addFilterCount}`,
        },
        {
          name: "pricing math (0.9 multiplier) not rewritten",
          pass: pricingUnchanged,
          weight: 1,
          detail: pricingUnchanged ? undefined : "pricing logic was altered",
        },
      ],
      verification: [
        {
          name: "read pricing.php or functions.php before editing",
          pass: readBeforeEdit,
          weight: 1,
        },
      ],
      cleanup: [
        {
          name: "no var_dump or error_log left",
          pass: noDebugOutput,
          weight: 2,
        },
      ],
    },
    {
      pass: "Double discount fixed; cart total is exactly 90% of input.",
      partial: "Discount partially fixed but some rubric checks failed.",
      fail: "Double discount not fixed; cart total is still 81.",
    }
  );
}

const scenario: Scenario = {
  id: "SB-31" as ScenarioId,
  name: "woo-double-discount",
  category: "surgical-edit",
  family: "bug-fix",
  requires: ["php"],
  prompt: PROMPT,
  async execute(ctx) {
    const { runtime, workDir, timeoutMs, onRuntimeEvent, runtimeOverrides } = ctx;

    if (!hasTool("php")) {
      const output: RuntimeOutput = {
        stdout: "",
        toolCalls: [],
        wallTimeMs: 0 as Ms,
        scenarioMetrics: { skipped: true, reason: "php-not-on-path" },
      };
      return {
        output,
        evaluation: createSkippedEvaluation("php on PATH", "SKIPPED: php not found on PATH"),
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

    const evaluation = await evaluateSB31({
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
  evaluate: evaluateSB31,
};

export default scenario;
