import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  noAddedComments,
  noConsoleLog,
  readOrEmpty,
  onlyChangedFiles,
} from "./_shared/helpers.js";
import { runHiddenTests, runBunTest, importsOf, fileCalls } from "./_shared/evaluators/index.js";

const PROMPT = `Read playground/sb49-format/SPEC.md and fix the invoices subsystem in playground/sb49-format/src/invoices.ts. Reuse the shared formatMoney from src/format.ts instead of reimplementing or redefining it, and do not break the receipts subsystem. Edit only src/invoices.ts. You can run the receipts tests with: bun test playground/sb49-format/src/receipts.test.ts`;

export const meta = {
  id: "SB-49",
  name: "cross-subsystem-reuse",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/sb49-format/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-49" as ScenarioId,
  name: "cross-subsystem-reuse",
  category: "implementation",
  family: "spec-impl",
  prompt: PROMPT,
  async evaluate({ playgroundDir }) {
    const fixtureDir = join(playgroundDir, "playground/sb49-format");
    const invoicesPath = join(fixtureDir, "src/invoices.ts");

    // Behavioral signal: hidden tests assert invoices now format USD/EUR/GBP
    // correctly AND the receipts subsystem still renders unchanged.
    const hidden = await runHiddenTests("SB-49", fixtureDir);
    const correct = hidden.total > 0 && hidden.rate === 1;

    // The untouched subsystem's own test file still goes green.
    const receiptsTest = await runBunTest(fixtureDir, "src/receipts.test.ts");

    const invoices = await readOrEmpty(invoicesPath);
    const origInvoices = await readFile(
      join(PLAYGROUND_SRC, "sb49-format/src/invoices.ts"),
      "utf-8"
    ).catch(() => "");

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/sb49-format/src/invoices.ts"],
    });

    // AST reuse signal: invoices imports format and calls formatMoney.
    const imports = invoices.length > 0 ? importsOf(invoicesPath) : [];
    const importsFormat = imports.some((m) => m.endsWith("/format") || m === "./format");
    const callsFormatMoney = invoices.length > 0 && fileCalls(invoicesPath, "formatMoney");
    // Anti-pattern: redefining the shared helper inside invoices.ts.
    const redefinesHelper =
      /function\s+formatMoney\b/.test(invoices) || /function\s+currencySymbol\b/.test(invoices);
    const keptSignature = /export\s+function\s+renderInvoice/.test(invoices);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "invoices fixed; receipts subsystem unaffected",
            pass: correct,
            weight: 3,
            detail: `${hidden.passed}/${hidden.total} hidden assertions passed`,
          },
        ],
        scope: [
          { name: "edited only invoices.ts", pass: scope.pass, weight: 2, detail: scope.detail },
        ],
        pattern: [
          { name: "imports the shared format module", pass: importsFormat, weight: 0.75 },
          { name: "calls formatMoney (reuse, not reimplement)", pass: callsFormatMoney, weight: 0.75 },
          { name: "did not redefine the shared helper", pass: !redefinesHelper, weight: 0.5 },
        ],
        verification: [
          {
            name: "receipts.test.ts still passes",
            pass: receiptsTest.pass,
            weight: 1,
            detail: receiptsTest.pass ? undefined : receiptsTest.stdout + receiptsTest.stderr,
          },
        ],
        cleanup: [
          {
            name: "kept renderInvoice signature + no comment churn",
            pass: keptSignature && noAddedComments(invoices, origInvoices),
            weight: 1,
          },
          { name: "no console.log added", pass: noConsoleLog(invoices), weight: 1 },
        ],
      },
      {
        pass: "Reused the shared formatMoney; invoices fixed, receipts untouched and green.",
        partial: "Invoices work but reimplemented the helper or skipped reuse.",
        fail: "Did not fix invoices via the shared abstraction.",
      }
    );
  },
};

export default scenario;
