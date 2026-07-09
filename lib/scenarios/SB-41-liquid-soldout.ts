import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  firstChangeTurn,
  onlyChangedFiles,
  readOrEmpty,
  readTurnsForPath,
} from "./_shared/helpers.js";
import { renderLiquid } from "./_shared/runners/liquid.js";

const TEMPLATE_PATH = "playground/liquid-shop/sections/featured-grid.liquid";

const PROMPT = `The featured product grid at \`playground/liquid-shop/sections/featured-grid.liquid\` is showing sold-out products even when the 'Show sold-out products' toggle is off in section settings. Fix the template to respect \`section.settings.show_soldout\`.`;

export const meta = {
  id: "SB-41",
  name: "liquid-soldout",
  category: "surgical-edit" as const,
  family: "regex-style" as const,
  difficulty: "medium" as const, // cognitive-load override (field mean inflated by strong-model sample)
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/liquid-shop/",
  prompt: PROMPT,
} as const;

const MOCK_PRODUCTS = [
  { id: 1, title: "Widget A", available: true, price: 1999 },
  { id: 2, title: "Widget B", available: false, price: 2999 },
];

const scenario: Scenario = {
  id: "SB-41" as ScenarioId,
  name: "liquid-soldout",
  category: "surgical-edit",
  family: "regex-style",
  difficulty: "medium",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const filePath = join(playgroundDir, TEMPLATE_PATH);
    const content = await readOrEmpty(filePath);

    // Strip schema block for rendering
    const templateOnly = content.replace(/\{%[-\s]*schema[\s\S]*?endschema[\s\s]*?%\}/g, "");

    const hideSoldout = await renderLiquid(templateOnly, {
      products: MOCK_PRODUCTS,
      section: { settings: { show_soldout: false } },
    });

    const showSoldout = await renderLiquid(templateOnly, {
      products: MOCK_PRODUCTS,
      section: { settings: { show_soldout: true } },
    });

    // When show_soldout=false: only 1 card (Widget A), not Widget B
    const hideCount = (hideSoldout.stdout.match(/product-card/g) ?? []).length;
    const showCount = (showSoldout.stdout.match(/product-card/g) ?? []).length;

    const hidesWhenOff = hideSoldout.ok && hideCount === 1;
    const showsWhenOn = showSoldout.ok && showCount === 2;

    // Pattern: uses if/unless with product.available
    const usesAvailableGuard =
      /\{%[-\s]*if\s+product\.available/.test(content) ||
      /\{%[-\s]*unless\s+product\.available/.test(content);
    const noDataMutation = !/\{%[-\s]*assign\s+products/.test(content);

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [TEMPLATE_PATH],
    });

    const changeTurn = firstChangeTurn(toolCalls);
    const readBeforeEdit =
      changeTurn !== undefined &&
      readTurnsForPath(toolCalls, TEMPLATE_PATH).some((t) => t < changeTurn);

    const noDebugComments = !/\{%[-\s]*comment[\s\S]*?endcomment[\s\s]*?%\}/.test(content);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "hides sold-out when show_soldout=false",
            pass: hidesWhenOff,
            weight: 2,
            detail: hidesWhenOff
              ? undefined
              : `expected 1 card, got ${hideCount}; output: ${hideSoldout.stdout.slice(0, 200)}`,
          },
          {
            name: "shows all when show_soldout=true",
            pass: showsWhenOn,
            weight: 1,
            detail: showsWhenOn
              ? undefined
              : `expected 2 cards, got ${showCount}; output: ${showSoldout.stdout.slice(0, 200)}`,
          },
        ],
        scope: [
          {
            name: "only featured-grid.liquid changed",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "uses available guard (if product.available or unless product.available)",
            pass: usesAvailableGuard,
            weight: 1,
            detail: usesAvailableGuard ? undefined : "no product.available guard found",
          },
          {
            name: "no data mutation (no assign products)",
            pass: noDataMutation,
            weight: 1,
            detail: noDataMutation ? undefined : "mutates products via assign",
          },
        ],
        verification: [
          {
            name: "read featured-grid.liquid before editing",
            pass: readBeforeEdit,
            weight: 1,
            detail: readBeforeEdit ? undefined : "no read before first edit",
          },
        ],
        cleanup: [
          {
            name: "no leftover comment blocks",
            pass: noDebugComments,
            weight: 1,
            detail: noDebugComments ? undefined : "leftover {% comment %} blocks found",
          },
          {
            name: "no spurious file changes",
            pass: scope.pass,
            weight: 1,
            detail: scope.pass ? undefined : `extra files changed: ${scope.detail}`,
          },
        ],
      },
      {
        pass: "sold-out guard works; only featured-grid.liquid changed.",
        partial: "Partial filtering or scope drift.",
        fail: "Sold-out products not filtered by section setting.",
      }
    );
  },
};

export default scenario;
