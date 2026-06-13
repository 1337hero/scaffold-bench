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
} from "./_shared/helpers.js";

const PROMPT = `Our SSE client drops the last event from the stream when it doesn't end with a blank line. This happens with some server implementations. The parser is in \`playground/streaming/lib/sse-client.mjs\`.`;

export const meta = {
  id: "SB-27",
  name: "sse-final-line",
  category: "surgical-edit" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/streaming/lib/sse-client.mjs",
  prompt: PROMPT,
} as const;

function evalParseSSE(source: string): string[] | null {
  try {
    const mod = new Function(source.replace(/^export\s+/m, "") + "\nreturn parseSSE;")();
    return mod(["data: hello\n\ndata: world\n"]);
  } catch {
    return null;
  }
}

const scenario: Scenario = {
  id: "SB-27" as ScenarioId,
  name: "sse-final-line",
  category: "surgical-edit",
  family: "regex-style",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const clientPath = join(playgroundDir, "playground/streaming/lib/sse-client.mjs");
    const client = await readOrEmpty(clientPath);

    const events = evalParseSSE(client);
    const parsesHello = events?.includes("hello") ?? false;
    const parsesWorld = events?.includes("world") ?? false;

    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/streaming/lib/sse-client.mjs"],
    });

    const hasBufferFlush = /if\s*\(\s*buffer/.test(client) || /buffer\.trim\s*\(\s*\)/.test(client);
    const keepsSplitApproach = /split\s*\(\s*["'\\n]{2,}["']\s*\)/.test(client);

    const evaluation = rubricToEvaluation(
      {
        correctness: [
          {
            name: "parses first event (hello)",
            pass: parsesHello,
            weight: 1,
            detail: events ? `got: ${JSON.stringify(events)}` : "could not evaluate",
          },
          {
            name: "parses final event without trailing newline (world)",
            pass: parsesWorld,
            weight: 2,
            detail: events ? `got: ${JSON.stringify(events)}` : "could not evaluate",
          },
        ],
        scope: [
          {
            name: "only sse-client.mjs changed",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "adds buffer flush after loop (minimal fix)",
            pass: hasBufferFlush,
            weight: 1,
            detail: hasBufferFlush ? undefined : "no post-loop buffer flush found",
          },
          {
            name: "keeps split-on-double-newline approach",
            pass: keepsSplitApproach,
            weight: 1,
            detail: keepsSplitApproach ? undefined : "rewrote core parsing logic",
          },
        ],
        verification: [
          {
            name: "read sse-client.mjs before editing",
            pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
            weight: 1,
          },
        ],
        cleanup: [
          {
            name: "no console.log",
            pass: noConsoleLog(client),
            weight: 1,
          },
          {
            name: "no debug output left",
            pass: !/console\.(warn|error|debug)\s*\(/.test(client),
            weight: 1,
          },
        ],
      },
      {
        pass: "SSE parser correctly flushes the final event without trailing newline.",
        partial: "Partial fix — some events parsed but final-line bug remains.",
        fail: "Final event still dropped when stream lacks trailing blank line.",
      }
    );

    return evaluation;
  },
};

export default scenario;
