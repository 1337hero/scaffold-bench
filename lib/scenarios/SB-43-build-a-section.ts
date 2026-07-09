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

const NEW_SECTION_PATH = "playground/liquid-shop/sections/product-spotlight.liquid";
const EXISTING_SECTION_PATH = "playground/liquid-shop/sections/featured-grid.liquid"; // for read-before-edit verification

const PROMPT = `Create a new Shopify section at \`playground/liquid-shop/sections/product-spotlight.liquid\`. Requirements: a text setting for the heading, a range or number setting for product limit (1-8, default 4), a checkbox for show_price, render prices using the \`money\` filter, and include a valid \`{% schema %}\` block with all these settings defined.`;

export const meta = {
  id: "SB-43",
  name: "build-a-section",
  category: "implementation" as const,
  family: "feature-add" as const,
  difficulty: "high" as const, // cognitive-load override (field mean inflated by strong-model sample)
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/liquid-shop/",
  prompt: PROMPT,
} as const;

const MOCK_PRODUCTS = [
  { id: 1, title: "Widget A", available: true, price: 1999 },
  { id: 2, title: "Widget B", available: true, price: 2999 },
  { id: 3, title: "Widget C", available: true, price: 999 },
  { id: 4, title: "Widget D", available: true, price: 3499 },
  { id: 5, title: "Widget E", available: true, price: 599 },
];

function parseSchemaBlock(content: string): Record<string, unknown> | null {
  const match = content.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

const scenario: Scenario = {
  id: "SB-43" as ScenarioId,
  name: "build-a-section",
  category: "implementation",
  family: "feature-add",
  difficulty: "high",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const sectionPath = join(playgroundDir, NEW_SECTION_PATH);

    const content = await readOrEmpty(sectionPath);

    // Schema validation
    const schema = parseSchemaBlock(content);
    const schemaValid = schema !== null;
    const settings: Array<Record<string, unknown>> = schemaValid
      ? (((schema as Record<string, unknown>).settings as Array<Record<string, unknown>>) ?? [])
      : [];

    const headingSetting = settings.find((s) => s.type === "text" && s.id === "heading");
    const limitSetting = settings.find(
      (s) => (s.type === "range" || s.type === "number") && s.id === "product_limit"
    );
    const priceSetting = settings.find((s) => s.type === "checkbox" && s.id === "show_price");

    const schemaHasRequired =
      headingSetting !== undefined && limitSetting !== undefined && priceSetting !== undefined;
    const limitDefault = limitSetting?.default === 4;

    // Behavioral: render with 5 products, limit=4 — should produce 4 cards
    const templateOnly = content.replace(/\{%-?\s*schema[\s\S]*?endschema\s*-?%\}/g, "");

    const rendered = await renderLiquid(templateOnly, {
      products: MOCK_PRODUCTS,
      section: { settings: { heading: "Spotlight", product_limit: 4, show_price: true } },
    });

    const renderedWithPrice = await renderLiquid(templateOnly, {
      products: MOCK_PRODUCTS,
      section: { settings: { heading: "Spotlight", product_limit: 4, show_price: true } },
    });

    const renderedNoPrice = await renderLiquid(templateOnly, {
      products: MOCK_PRODUCTS,
      section: { settings: { heading: "Spotlight", product_limit: 4, show_price: false } },
    });

    const cardCount = (rendered.stdout.match(/spotlight-card|product-card/g) ?? []).length;
    const rendersProducts = rendered.ok && cardCount >= 1;

    // money filter: prices like $19.99
    const usesMoney = /\|\s*money/.test(content);
    const priceInOutput = /\$\d+\.\d{2}/.test(renderedWithPrice.stdout);
    const priceHiddenWhenOff = !/\$\d+\.\d{2}/.test(renderedNoPrice.stdout);

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [NEW_SECTION_PATH],
    });

    const changeTurn = firstChangeTurn(toolCalls);
    const readBeforeEdit =
      changeTurn !== undefined &&
      readTurnsForPath(toolCalls, EXISTING_SECTION_PATH).some((t) => t < changeTurn);

    const noDebugOutput = !/\{\{[-\s]*dump|console\.log/.test(content);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "schema parses and has heading, product_limit, show_price settings",
            pass: schemaValid && schemaHasRequired,
            weight: 1,
            detail:
              schemaValid && schemaHasRequired
                ? undefined
                : schemaValid
                  ? `missing settings: heading=${!!headingSetting} limit=${!!limitSetting} price=${!!priceSetting}`
                  : "no valid {% schema %} block found",
          },
          {
            name: "renders products via liquid",
            pass: rendersProducts,
            weight: 1,
            detail: rendersProducts
              ? undefined
              : `render failed or 0 cards: ${rendered.stderr || rendered.stdout.slice(0, 200)}`,
          },
          {
            name: "product_limit default is 4",
            pass: limitDefault,
            weight: 1,
            detail: limitDefault
              ? undefined
              : `product_limit default is ${limitSetting?.default}, expected 4`,
          },
        ],
        scope: [
          {
            name: "only product-spotlight.liquid created",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "money filter used; show_price=false hides prices",
            pass: usesMoney && priceInOutput && priceHiddenWhenOff,
            weight: 1,
            detail:
              usesMoney && priceInOutput
                ? undefined
                : `money filter: ${usesMoney}, price in output: ${priceInOutput}`,
          },
          {
            name: "no existing sections modified (scope)",
            pass: scope.pass,
            weight: 1,
            detail: scope.pass ? undefined : `existing sections modified: ${scope.detail}`,
          },
        ],
        verification: [
          {
            name: "read existing section for reference before creating",
            pass: readBeforeEdit,
            weight: 1,
            detail: readBeforeEdit ? undefined : "no read of featured-grid.liquid before creating",
          },
        ],
        cleanup: [
          {
            name: "no debug output in template",
            pass: noDebugOutput,
            weight: 1,
            detail: noDebugOutput ? undefined : "debug output found in template",
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
        pass: "section renders products with money filter; schema valid; no scope drift.",
        partial: "Schema valid but rendering issues or scope drift.",
        fail: "Missing schema or products not rendered.",
      }
    );
  },
};

export default scenario;
