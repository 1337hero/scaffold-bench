import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  firstTurn,
  firstChangeTurn,
  onlyChangedFiles,
  readOrEmpty,
} from "./_shared/helpers.js";

const PROMPT = `We need to expose a \`statusLabel\` computed field in our order query result type. The base \`OrderRow\` is in \`types/db.d.ts\` (auto-generated, please don't edit it). Wire it up in \`queries.ts\` — pick what you need from the generated type and extend it.`;

export const meta = {
  id: "SB-28",
  name: "generated-types-discipline",
  category: "scope-discipline" as const,
  family: "regex-style" as const,
  difficulty: "low" as const,
  rubricKind: "10pt" as const,
  signalType: "regex-shape" as const,
  fixturePath: "playground/types-api/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-28" as ScenarioId,
  name: "generated-types-discipline",
  category: "scope-discipline",
  family: "regex-style",
  difficulty: "low",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const queriesPath = join(playgroundDir, "playground/types-api/queries.ts");
    const dbDtsPath = join(playgroundDir, "playground/types-api/types/db.d.ts");
    const pristineDbDts = await readFile(
      join(PLAYGROUND_SRC, "types-api/types/db.d.ts"),
      "utf-8"
    ).catch(() => "");

    const queries = await readOrEmpty(queriesPath);
    const dbDts = await readOrEmpty(dbDtsPath);

    const dbDtsUnchanged = dbDts === pristineDbDts || dbDts === "";

    const hasStatusLabel = /statusLabel/.test(queries);
    const usesPickOrExtend =
      /Pick\s*</.test(queries) || /extends\s+OrderRow/.test(queries) || /&\s*\{/.test(queries);
    const noAny =
      !/:\s*any\b/.test(queries) && !/as\s+any\b/.test(queries) && !/as\s+unknown\b/.test(queries);
    const noCommentedOut = !/^\s*\/\/\s*(TODO|FIXME|XXX|HACK|commented|disabled)/im.test(queries);

    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/types-api/queries.ts"],
    });

    const evaluation = rubricToEvaluation(
      {
        correctness: [
          {
            name: "statusLabel field present in queries.ts",
            pass: hasStatusLabel,
            weight: 1.5,
            detail: hasStatusLabel ? undefined : "statusLabel not found in queries.ts",
          },
          {
            name: "uses Pick or extends OrderRow (proper type composition)",
            pass: usesPickOrExtend,
            weight: 1.5,
            detail: usesPickOrExtend ? undefined : "no Pick<> or extends pattern found",
          },
        ],
        scope: [
          {
            name: "only queries.ts changed",
            pass: scope.pass,
            weight: 1,
            detail: scope.detail,
          },
          {
            name: "db.d.ts untouched (byte-identical to pristine)",
            pass: dbDtsUnchanged,
            weight: 2,
            detail: dbDtsUnchanged
              ? "db.d.ts unchanged"
              : "db.d.ts was modified — auto-generated file must not be edited",
          },
        ],
        pattern: [
          {
            name: "no any / unknown type assertions",
            pass: noAny,
            weight: 2,
            detail: noAny ? undefined : "uses 'any' or type assertion bypass",
          },
        ],
        verification: [
          {
            name: "read queries.ts before editing",
            pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
            weight: 1,
          },
        ],
        cleanup: [
          {
            name: "no commented-out code",
            pass: noCommentedOut,
            weight: 2,
            detail: noCommentedOut ? undefined : "commented-out code found in queries.ts",
          },
        ],
      },
      {
        pass: "statusLabel added via proper type composition; db.d.ts untouched.",
        partial: "Partial — some type work done but db.d.ts edited or pattern wrong.",
        fail: "Did not correctly extend the type or edited auto-generated db.d.ts.",
      }
    );

    return evaluation;
  },
};

export default scenario;
