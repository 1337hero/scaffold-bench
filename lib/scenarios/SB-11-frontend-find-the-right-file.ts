import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { checksToEvaluation } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import {
  PLAYGROUND_SRC,
  firstChangeTurn,
  firstTurn,
  onlyChangedFiles,
  searchBeforeEdit,
  stripComments,
} from "./_shared/helpers.js";

export const meta = {
  id: "SB-11",
  name: "frontend-find-the-right-file",
  category: "surgical-edit" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  fixturePath: "playground/frontend/",
  prompt: `Refund amounts render as \`$-5.00\` instead of \`-$5.00\` in the invoices UI. Fix the bug with the smallest correct change.`,
} as const;

const scenario: Scenario = {
  id: "SB-11" as ScenarioId,
  name: "frontend-find-the-right-file",
  category: "surgical-edit",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const helper = await readFile(
      join(playgroundDir, "playground/frontend/currency.ts"),
      "utf-8"
    );
    const helperOriginal = await readFile(join(PLAYGROUND_SRC, "frontend/currency.ts"), "utf-8");
    const invoice = await readFile(
      join(playgroundDir, "playground/frontend/InvoiceTable.tsx"),
      "utf-8"
    );
    const invoiceOriginal = await readFile(join(PLAYGROUND_SRC, "frontend/InvoiceTable.tsx"), "utf-8");
    const summary = await readFile(
      join(playgroundDir, "playground/frontend/RefundSummary.tsx"),
      "utf-8"
    );
    const summaryOriginal = await readFile(
      join(PLAYGROUND_SRC, "frontend/RefundSummary.tsx"),
      "utf-8"
    );
    const helperCode = stripComments(helper);
    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);
    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/frontend/currency.ts"],
    });

    const checks = [
      {
        name: "searched before editing",
        pass: searchBeforeEdit(toolCalls),
      },
      {
        name: "read before changing files (turn-ordered)",
        pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
      },
      {
        name: "edited only currency.ts",
        pass: scope.pass,
        detail: scope.detail,
      },
      {
        name: "formatCurrency now handles negative amounts",
        pass:
          helper !== helperOriginal &&
          (/Math\.abs\s*\(\s*amount\s*\)/.test(helperCode) ||
            /amount\s*<\s*0/.test(helperCode)) &&
          /-\$\{?\$?/.test(helperCode.replace(/\s+/g, "")),
      },
      {
        name: "invoice UI left untouched",
        pass: invoice === invoiceOriginal,
      },
      {
        name: "refund summary left untouched",
        pass: summary === summaryOriginal,
      },
    ];

    return checksToEvaluation(checks, {
      pass: "Found the shared formatting helper and fixed the real source of the bug.",
      partial: "Fixed the display issue, but with extra drift or the wrong file ownership.",
      fail: "Did not find the right file or changed the wrong layer.",
    });
  },
};

export default scenario;
