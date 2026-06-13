import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { Ms, ScenarioId } from "../schemas/brands.js";
import { classifyRuntimeError, runtimeErrorEvaluation } from "../scoring.ts";
import type { RuntimeOutput } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  createSkippedEvaluation,
  onlyChangedFiles,
} from "./_shared/helpers.js";
import { runPhp } from "./_shared/runners/php.js";
import { hasTool } from "./_shared/toolchain.js";

const PROMPT =
  "Create a WordPress plugin at `playground/php-wp/plugins/recent-posts-widget.php`. It should implement a `[recent_posts count=\"N\"]` shortcode that renders a `<ul>` of recent post titles. Requirements: count should be clamped between 1 and 10 (default: read from the `rpw_default_count` option, fallback 5), all output must be escaped, the count parameter must be sanitized with absint, include a valid WordPress plugin header comment.";

export const meta = {
  id: "SB-34",
  name: "build-a-plugin",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/php-wp/",
  requires: ["php"],
  timeoutMs: 60_000,
  prompt: PROMPT,
} as const;

const PLUGIN_PATH = "playground/php-wp/plugins/recent-posts-widget.php";

async function invokeShortcode(
  pluginContent: string,
  wpStubsPath: string,
  count: number
): Promise<string> {
  const entryPhp = `<?php
require_once __DIR__ . '/wp-stubs.php';
${pluginContent.replace(/^<\?php\s*\n?/, "")}
echo do_shortcode_tag('recent_posts', ['count' => ${count}]);
`;
  const result = await runPhp(
    "entry.php",
    { "entry.php": entryPhp },
    wpStubsPath
  );
  return result.ok ? result.stdout : "";
}

const scenario: Scenario = {
  id: "SB-34" as ScenarioId,
  name: "build-a-plugin",
  category: "implementation",
  family: "spec-impl",
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
        timeoutMs: timeoutMs ?? 60_000,
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

    const wpStubsPath = join(workDir, "playground/php-wp/wp-stubs.php");
    const pluginFile = join(workDir, PLUGIN_PATH);
    const pluginContent = await readFile(pluginFile, "utf-8").catch(() => "");

    const hasPluginHeader = /Plugin Name\s*:/i.test(pluginContent);

    const renderedNormal = await invokeShortcode(pluginContent, wpStubsPath, 5);

    const hasUlOutput = /<ul/.test(renderedNormal) && /<li/.test(renderedNormal);

    // Check source code for explicit clamping logic (not runtime behavior via stubs)
    const hasClampLogic =
      /min\s*\(\s*10/.test(pluginContent) &&
      /max\s*\(\s*1/.test(pluginContent);

    const usesAbsint = /absint\s*\(/.test(pluginContent);
    const usesEscHtml = /esc_html\s*\(/.test(pluginContent);
    const noRawEcho = !/echo\s+\$_GET|echo\s+\$_POST|echo\s+\$_REQUEST/.test(pluginContent);
    // Shortcode must return, not echo
    const returnsOutput = /return\s+\$output/.test(pluginContent) || /return\s+ob_get/.test(pluginContent);

    const scope = await onlyChangedFiles({
      playgroundDir: workDir,
      allowedPaths: [PLUGIN_PATH],
    });

    const readBeforeWrite =
      output.toolCalls.some(
        (c) => c.name === "read" && (c.args.includes("wp-stubs") || c.args.includes("php-wp"))
      );

    const noDebugOutput =
      !/var_dump\s*\(/.test(pluginContent) &&
      !/error_log\s*\(/.test(pluginContent) &&
      !/\becho\s+\$output\b/.test(pluginContent);

    const evaluation = rubricToEvaluation(
      {
        correctness: [
          {
            name: "renders <ul> with <li> items",
            pass: hasUlOutput,
            weight: 1,
            detail: hasUlOutput ? undefined : `rendered: ${renderedNormal.slice(0, 300)}`,
          },
          {
            name: "source clamps count between 1 and 10 (min/max)",
            pass: hasClampLogic,
            weight: 1,
            detail: hasClampLogic ? undefined : "no min(10,...) or max(1,...) found in source",
          },
          {
            name: "valid WordPress plugin header present",
            pass: hasPluginHeader,
            weight: 1,
            detail: hasPluginHeader ? undefined : "no 'Plugin Name:' header comment found",
          },
        ],
        scope: [
          {
            name: "only plugins/recent-posts-widget.php created",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "uses absint() on count input",
            pass: usesAbsint,
            weight: 1,
            detail: usesAbsint ? undefined : "absint() not used",
          },
          {
            name: "uses esc_html() and shortcode returns (not echoes) output",
            pass: usesEscHtml && returnsOutput,
            weight: 1,
            detail:
              usesEscHtml && returnsOutput
                ? undefined
                : `esc_html=${usesEscHtml} returnsOutput=${returnsOutput}`,
          },
        ],
        verification: [
          {
            name: "read wp-stubs or php-wp directory before writing",
            pass: readBeforeWrite,
            weight: 1,
          },
        ],
        cleanup: [
          {
            name: "no var_dump or error_log left in plugin",
            pass: noDebugOutput,
            weight: 2,
          },
        ],
      },
      {
        pass: "Plugin implements shortcode with correct clamping, escaping, and plugin header.",
        partial: "Plugin partially implemented but some rubric checks failed.",
        fail: "Plugin not created or has XSS/missing plugin header.",
      }
    );

    return { output, evaluation };
  },
};

export default scenario;
