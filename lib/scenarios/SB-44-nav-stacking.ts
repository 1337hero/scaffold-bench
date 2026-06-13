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
import { declarationsFor, hasImportant } from "./_shared/runners/css.js";

const MAIN_CSS_PATH = "playground/css-ui/styles/main.css";

const PROMPT = `The mobile navigation dropdown opens behind the hero banner on our site. The CSS is at \`playground/css-ui/styles/main.css\`. Fix the stacking issue without adding !important or inline styles, and without restructuring the hero styles.`;

export const meta = {
  id: "SB-44",
  name: "nav-stacking",
  category: "scope-discipline" as const,
  family: "bug-fix" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/css-ui/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-44" as ScenarioId,
  name: "nav-stacking",
  category: "scope-discipline",
  family: "bug-fix",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const mainCssPath = join(playgroundDir, MAIN_CSS_PATH);
    const css = await readOrEmpty(mainCssPath);

    const navDecls = declarationsFor(css, ".nav");
    const navMenuDecls = declarationsFor(css, ".nav-menu");
    const heroDecls = declarationsFor(css, ".hero");

    const navHasPosition = navDecls["position"] !== undefined;
    const navZIndex = parseInt(navDecls["z-index"] ?? "0", 10);
    const navZIndexAboveHero = navHasPosition && navZIndex > 1;

    const navMenuHasPosition = navMenuDecls["position"] !== undefined;
    const navMenuZIndex = parseInt(navMenuDecls["z-index"] ?? "0", 10);
    const navMenuZIndexAboveHero = navMenuHasPosition && navMenuZIndex > 1;

    const navFixed = navZIndexAboveHero || navMenuZIndexAboveHero;

    const noImportant = !hasImportant(css);

    const heroPosition = heroDecls["position"];
    const heroZIndex = heroDecls["z-index"];
    const heroUnchanged = heroPosition === "relative" && heroZIndex === "1";

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [MAIN_CSS_PATH],
    });

    const changeTurn = firstChangeTurn(toolCalls);
    const readBeforeEdit =
      changeTurn !== undefined &&
      readTurnsForPath(toolCalls, MAIN_CSS_PATH).some((t) => t < changeTurn);

    const noCommentedExperiments =
      !/\/\*[\s\S]*?\*\//.test(css) ||
      !/stacking|z-index|position/i.test((css.match(/\/\*[\s\S]*?\*\//g) ?? []).join(" "));

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "nav or nav-menu has positioned context with z-index > 1 and no !important",
            pass: navFixed && noImportant,
            weight: 2,
            detail:
              navFixed && noImportant
                ? undefined
                : "nav/nav-menu missing proper stacking fix (or !important used)",
          },
          {
            name: "hero position:relative z-index:1 preserved",
            pass: heroUnchanged,
            weight: 1,
            detail: heroUnchanged ? undefined : "hero stacking context was modified",
          },
        ],
        scope: [
          {
            name: "only main.css changed",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "fix is on .nav or .nav-menu without !important",
            pass: navFixed && heroUnchanged && noImportant,
            weight: 2,
            detail:
              navFixed && heroUnchanged && noImportant
                ? undefined
                : "fix applied to wrong element, hero restructured, or !important used",
          },
        ],
        verification: [
          {
            name: "read main.css before editing",
            pass: readBeforeEdit,
            weight: 1,
            detail: readBeforeEdit ? undefined : "main.css not read before editing",
          },
        ],
        cleanup: [
          {
            name: "no commented-out CSS experiments",
            pass: noCommentedExperiments,
            weight: 1,
            detail: noCommentedExperiments ? undefined : "commented CSS experiments found",
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
        pass: "Nav stacking fixed cleanly — positioned context above hero, no !important.",
        partial: "Stacking fix attempted but with antipatterns or wrong scope.",
        fail: "Nav still renders behind hero or !important used.",
      }
    );
  },
};

export default scenario;
