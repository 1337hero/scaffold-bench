import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { readOrEmpty, onlyChangedFiles, firstChangeTurn, readTurnsForPath } from "./_shared/helpers.js";
import { declarationsFor, mediaQueryBlocks } from "./_shared/runners/css.js";

const MAIN_CSS_PATH = "playground/css-ui/styles/main.css";

const PROMPT = `Add a \`.card-grid\` layout to \`playground/css-ui/styles/main.css\` using CSS Grid. Specs: 1 column below 640px, 2 columns below 1024px, 3 columns at 1024px and above. Use \`var(--grid-gap, 1.5rem)\` for the grid gap. No flexbox, no floats, no frameworks.`;

export const meta = {
  id: "SB-46",
  name: "responsive-grid",
  category: "implementation" as const,
  family: "feature-add" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/css-ui/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-46" as ScenarioId,
  name: "responsive-grid",
  category: "implementation",
  family: "feature-add",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const mainCssPath = join(playgroundDir, MAIN_CSS_PATH);
    const css = await readOrEmpty(mainCssPath);

    const cardGridDecls = declarationsFor(css, ".card-grid");
    const isGrid = cardGridDecls["display"] === "grid";
    const noFlex = cardGridDecls["display"] !== "flex";
    const usesGridGap = /var\(--grid-gap/.test(cardGridDecls["gap"] ?? "") ||
      /var\(--grid-gap/.test(cardGridDecls["grid-gap"] ?? "");

    const blocks = mediaQueryBlocks(css);
    const has640 = blocks.some((b) => /640px/.test(b.query));
    const has1024 = blocks.some((b) => /1024px/.test(b.query));

    const block640Content = blocks.find((b) => /640px/.test(b.query))?.content ?? "";
    const block1024Content = blocks.find((b) => /1024px/.test(b.query))?.content ?? "";

    const has2ColAt640 = /repeat\(\s*2/.test(block640Content) || /1fr\s+1fr/.test(block640Content);
    const has3ColAt1024 = /repeat\(\s*3/.test(block1024Content) || /1fr\s+1fr\s+1fr/.test(block1024Content);

    const noFloats = !/\.card-grid[\s\S]{0,200}float\s*:/.test(css);

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [MAIN_CSS_PATH],
    });

    const changeTurn = firstChangeTurn(toolCalls);
    const readBeforeEdit =
      changeTurn !== undefined &&
      readTurnsForPath(toolCalls, MAIN_CSS_PATH).some((t) => t < changeTurn);

    const noCommentedExperiments = !/\/\*[\s\S]*?grid[\s\S]*?\*\//.test(css);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: ".card-grid has display: grid",
            pass: isGrid,
            weight: 1,
            detail: isGrid ? undefined : ".card-grid missing display: grid",
          },
          {
            name: "media queries at 640px and 1024px with correct column counts",
            pass: has640 && has1024 && has2ColAt640 && has3ColAt1024,
            weight: 1,
            detail: has640 && has1024 && has2ColAt640 && has3ColAt1024
              ? undefined
              : `640px:${has640} 2col:${has2ColAt640} 1024px:${has1024} 3col:${has3ColAt1024}`,
          },
          {
            name: "uses var(--grid-gap, 1.5rem) for gap",
            pass: usesGridGap,
            weight: 1,
            detail: usesGridGap ? undefined : "gap does not use var(--grid-gap)",
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
            name: "breakpoints exactly 640px and 1024px",
            pass: has640 && has1024,
            weight: 1,
            detail: has640 && has1024 ? undefined : "wrong breakpoints used",
          },
          {
            name: "no flexbox or floats on .card-grid",
            pass: noFlex && noFloats,
            weight: 1,
            detail: noFlex && noFloats ? undefined : "flexbox or float used instead of grid",
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
            name: "no commented-out grid experiments",
            pass: noCommentedExperiments,
            weight: 1,
            detail: noCommentedExperiments ? undefined : "commented grid experiments found",
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
        pass: "CSS Grid with correct breakpoints and var(--grid-gap); no flexbox.",
        partial: "Grid implemented but wrong breakpoints or missing gap variable.",
        fail: "Flexbox used or breakpoints wrong or display:grid missing.",
      }
    );
  },
};

export default scenario;
