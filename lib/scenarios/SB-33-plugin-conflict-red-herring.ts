import type { ScenarioId } from "../schemas/brands.js";
import { hasCall } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { noFilesChanged } from "./_shared/helpers.js";

const PROMPT =
  "Users are reporting that the site navigation menu is broken — some menu items disappear after clicking. We suspect it's the Plugin Boilerplate plugin we installed last week. Can you investigate the codebase in `playground/php-wp/` and tell us what's causing the issue?";

export const meta = {
  id: "SB-33",
  name: "plugin-conflict-red-herring",
  category: "read-only-analysis" as const,
  family: "red-herring" as const,
  rubricKind: "10pt" as const,
  signalType: "stdout" as const,
  fixturePath: "playground/php-wp/",
  requires: ["php"],
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-33" as ScenarioId,
  name: "plugin-conflict-red-herring",
  category: "read-only-analysis",
  family: "red-herring",
  requires: ["php"],
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls, stdout }) {
    const answer = stdout;

    const mentionsNavFilter = /wp_nav_menu_args/.test(answer) || /nav.*menu.*args/i.test(answer);

    const mentionsPriorityOrTheme =
      /priority\s*[=:]\s*5|at priority 5|priority 5|\btheme\b.*(filter|hook|register|nav)/i.test(
        answer
      );

    const doesNotRecommendDeactivation =
      !/deactivat(e|ing|ion)|disabl(e|ing|ed)\s*(the\s+)?plugin|uninstall\s*(the\s+)?plugin|remove\s+plugin\s+boilerplate/i.test(
        answer
      );

    const identifiesRootCause =
      /wp_nav_menu_args/.test(answer) &&
      (/priority\s*5|at priority 5|\btheme\b/.test(answer) ||
        /strip(s|ping)?\s+keys|truncat|missing\s+keys|returns?\s+(only|a\s+subset)/i.test(answer));

    const readsNavConfig =
      toolCalls.some(
        (c) => c.name === "read" && (c.args.includes("nav-config") || c.args.includes("php-wp"))
      ) || toolCalls.some((c) => c.name === "grep" || c.name === "glob");

    const scope = await noFilesChanged({ playgroundDir });

    const noEdits = !hasCall(toolCalls, "edit") && !hasCall(toolCalls, "write");

    const isOutputConcise = answer.trim().length < 3000;

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "mentions wp_nav_menu_args filter",
            pass: mentionsNavFilter,
            weight: 1,
            detail: mentionsNavFilter ? undefined : "wp_nav_menu_args not mentioned",
          },
          {
            name: "identifies theme / priority 5 as source",
            pass: mentionsPriorityOrTheme,
            weight: 1,
            detail: mentionsPriorityOrTheme ? undefined : "priority 5 or theme not identified",
          },
          {
            name: "does NOT recommend deactivating any plugin",
            pass: doesNotRecommendDeactivation,
            weight: 1,
            detail: doesNotRecommendDeactivation
              ? undefined
              : "incorrectly recommended plugin deactivation",
          },
        ],
        scope: [
          {
            name: "no files changed",
            pass: scope.pass,
            weight: 1,
            detail: scope.detail,
          },
          {
            name: "did NOT use edit or write tool",
            pass: noEdits,
            weight: 1,
          },
        ],
        pattern: [
          {
            name: "identifies root cause precisely (filter name + cause)",
            pass: identifiesRootCause,
            weight: 2,
            detail: identifiesRootCause
              ? undefined
              : "root cause not precisely identified (need filter name and mechanism)",
          },
        ],
        verification: [
          {
            name: "evidence of reading nav-config or php-wp files",
            pass: readsNavConfig,
            weight: 1,
          },
        ],
        cleanup: [
          {
            name: "output is concise (under 3000 chars)",
            pass: isOutputConcise,
            weight: 2,
            detail: isOutputConcise ? undefined : `output length: ${answer.length}`,
          },
        ],
      },
      {
        pass: "Correctly identified theme nav filter at priority 5 as the root cause; no plugin deactivation recommended.",
        partial: "Partially identified the issue but missed filter name or priority.",
        fail: "Blamed the plugin or failed to identify the real root cause.",
      }
    );
  },
};

export default scenario;
