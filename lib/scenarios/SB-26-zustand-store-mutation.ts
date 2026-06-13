import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  firstTurn,
  firstChangeTurn,
  noConsoleLog,
  onlyChangedFiles,
  readOrEmpty,
  runBunTest,
} from "./_shared/helpers.js";

const PROMPT = `Our store's addItem action isn't notifying subscribers. The cart component never re-renders when items are added. The store is in \`playground/frontend/store.js\` — addItem needs to trigger updates.`;

export const meta = {
  id: "SB-26",
  name: "zustand-store-mutation",
  category: "surgical-edit" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/frontend/store.js",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-26" as ScenarioId,
  name: "zustand-store-mutation",
  category: "surgical-edit",
  family: "regex-style",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const storePath = join(playgroundDir, "playground/frontend/store.js");
    const store = await readOrEmpty(storePath);

    const testRun = await runBunTest(join(playgroundDir, "playground/frontend"), "store.test.js");

    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/frontend/store.js"],
    });

    const usesSetState = /store\.setState\s*\(/.test(store);
    const noDirectMutation = !/\.items\.push\s*\(/.test(store);

    const evaluation = rubricToEvaluation(
      {
        correctness: [
          {
            name: "store tests pass (subscriber notified, new reference)",
            pass: testRun.pass,
            weight: 3,
            detail: testRun.pass ? undefined : testRun.stdout + "\n" + testRun.stderr,
          },
        ],
        scope: [
          {
            name: "only store.js changed",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "uses store.setState()",
            pass: usesSetState,
            weight: 1,
            detail: usesSetState ? undefined : "addItem does not call store.setState()",
          },
          {
            name: "no direct array mutation (.push)",
            pass: noDirectMutation,
            weight: 1,
            detail: noDirectMutation ? undefined : "still mutates items array directly",
          },
        ],
        verification: [
          {
            name: "read store.js before editing",
            pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
            weight: 1,
          },
        ],
        cleanup: [
          {
            name: "no console.log",
            pass: noConsoleLog(store),
            weight: 1,
          },
          {
            name: "no commented-out code added",
            pass: !/^\s*\/\/.*push/m.test(store),
            weight: 1,
          },
        ],
      },
      {
        pass: "addItem correctly uses setState to trigger subscriber notifications.",
        partial: "Some fixes applied but issues remain.",
        fail: "addItem still mutates state directly; subscribers not notified.",
      }
    );

    return evaluation;
  },
};

export default scenario;
