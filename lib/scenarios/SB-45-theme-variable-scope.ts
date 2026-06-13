import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  readOrEmpty,
  onlyChangedFiles,
  firstChangeTurn,
  readTurnsForPath,
} from "./_shared/helpers.js";
import { customPropertyScope, declarationsFor } from "./_shared/runners/css.js";

const THEME_CSS_PATH = "playground/css-ui/styles/theme.css";
const MAIN_CSS_PATH = "playground/css-ui/styles/main.css";

const PROMPT = `Dark mode isn't working for our card components — they stay white even when the \`.dark\` class is applied to the body. The issue is in how \`--card-bg\` is defined in \`playground/css-ui/styles/theme.css\`. Fix the variable scope so both themes work correctly without touching the component styles in main.css.`;

export const meta = {
  id: "SB-45",
  name: "theme-variable-scope",
  category: "scope-discipline" as const,
  family: "bug-fix" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/css-ui/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-45" as ScenarioId,
  name: "theme-variable-scope",
  category: "scope-discipline",
  family: "bug-fix",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const themeCssPath = join(playgroundDir, THEME_CSS_PATH);
    const mainCssPath = join(playgroundDir, MAIN_CSS_PATH);

    const themeCss = await readOrEmpty(themeCssPath);
    const mainCss = await readOrEmpty(mainCssPath);

    const cardBgScopes = customPropertyScope(themeCss, "--card-bg");
    const hasRoot = cardBgScopes.some((s) => s === ":root" || s === "html");
    const hasDark = cardBgScopes.some((s) => s === ".dark");

    const cardDecls = declarationsFor(mainCss, ".card");
    const cardUsesVar = /var\(--card-bg/.test(cardDecls["background"] ?? "");
    const cardHardcoded = !cardUsesVar && cardDecls["background"] !== undefined;

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [THEME_CSS_PATH],
    });

    const changeTurn = firstChangeTurn(toolCalls);
    const readBeforeEdit =
      changeTurn !== undefined &&
      (readTurnsForPath(toolCalls, THEME_CSS_PATH).some((t) => t < changeTurn) ||
        readTurnsForPath(toolCalls, MAIN_CSS_PATH).some((t) => t < changeTurn));

    const noCommentedExperiments = !/\/\*[\s\S]*?card-bg[\s\S]*?\*\//.test(themeCss);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "--card-bg defined on :root or html",
            pass: hasRoot,
            weight: 1,
            detail: hasRoot ? undefined : "--card-bg not found on :root or html",
          },
          {
            name: "--card-bg overridden in .dark",
            pass: hasDark,
            weight: 1,
            detail: hasDark ? undefined : "--card-bg not defined in .dark",
          },
          {
            name: ".card still uses var(--card-bg)",
            pass: !cardHardcoded,
            weight: 1,
            detail: !cardHardcoded
              ? undefined
              : ".card has hardcoded background instead of var(--card-bg)",
          },
        ],
        scope: [
          {
            name: "only theme.css changed",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "fix in theme.css scope, variable approach preserved",
            pass: hasRoot && hasDark,
            weight: 1,
            detail: hasRoot && hasDark ? undefined : "custom property scope not correctly set",
          },
          {
            name: ".card component uses var(--card-bg), not hardcoded",
            pass: !cardHardcoded,
            weight: 1,
            detail: !cardHardcoded ? undefined : "component style hardcoded — wrong approach",
          },
        ],
        verification: [
          {
            name: "read theme.css or main.css before editing",
            pass: readBeforeEdit,
            weight: 1,
            detail: readBeforeEdit ? undefined : "neither file read before editing",
          },
        ],
        cleanup: [
          {
            name: "no commented-out fallback hardcodes",
            pass: noCommentedExperiments,
            weight: 1,
            detail: noCommentedExperiments ? undefined : "commented --card-bg experiments found",
          },
          {
            name: "no spurious file changes",
            pass: scope.pass,
            weight: 1,
            detail: scope.pass ? undefined : `extra files: ${scope.detail}`,
          },
        ],
      },
      {
        pass: "--card-bg scoped to :root and .dark; .card component unchanged.",
        partial: "Variable scope partially fixed but main.css modified or scope incomplete.",
        fail: ".card hardcoded or --card-bg still missing from .dark.",
      }
    );
  },
};

export default scenario;
