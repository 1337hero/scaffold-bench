import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { hasCall } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { PLAYGROUND_SRC, noFilesChanged, stripComments } from "./_shared/helpers.js";

const PROMPT = `A user reports a security bug in playground/hono-api: "When I log out (DELETE /sessions) my session token still works — logout never actually invalidates the session." Investigate src/routes/sessions.ts and src/lib/auth.ts. If this is a real bug, fix it; if not, explain why the report is mistaken. Do not change code unless there is a real bug.`;

export const meta = {
  id: "SB-50",
  name: "hono-user-is-wrong-logout",
  category: "read-only-analysis" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "stdout" as const,
  fixturePath: "playground/hono-api/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-50" as ScenarioId,
  name: "hono-user-is-wrong-logout",
  category: "read-only-analysis",
  family: "regex-style",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls, stdout }) {
    const fixture = join(playgroundDir, "playground/hono-api");
    const ORIG = join(PLAYGROUND_SRC, "hono-api");

    const sessions = await readFile(join(fixture, "src/routes/sessions.ts"), "utf-8").catch(() => "");
    const origSessions = await readFile(join(ORIG, "src/routes/sessions.ts"), "utf-8").catch(() => "");
    const auth = await readFile(join(fixture, "src/lib/auth.ts"), "utf-8").catch(() => "");
    const origAuth = await readFile(join(ORIG, "src/lib/auth.ts"), "utf-8").catch(() => "");

    const answer = stripComments(stdout);
    const scope = await noFilesChanged({ playgroundDir });

    // The contradiction lives across two files:
    //  - sessions.ts DELETE /sessions runs `DELETE FROM sessions WHERE token = ?`
    //  - auth.ts requireUser rejects any token without a matching session row.
    // So logout DOES invalidate; the report is mistaken.
    const recognizesNoBug =
      /no (real )?bug|not a (real )?bug|report is (mistaken|wrong|incorrect)|works as intended|already (invalidat|revok)|behaves correctly|no security (bug|issue)/i.test(
        answer
      );
    const citesDelete =
      /DELETE\s+FROM\s+sessions|deletes? the session row|removes? the (session|token) (row|record)|delete[sd]? the token/i.test(
        answer
      );
    const citesAuthRejection =
      /requireUser|auth(\.ts)?[^.]*reject|no (matching )?(session|row).*reject|reject.*(unknown|missing|deleted).*token|token .*no longer (matches|exists|valid)|lookup fails/i.test(
        answer
      );

    return rubricToEvaluation(
      {
        correctness: [
          { name: "concludes the report is mistaken (no real bug)", pass: recognizesNoBug, weight: 1.5 },
          {
            name: "cites the DELETE that removes the session row",
            pass: citesDelete,
            weight: 0.75,
          },
          {
            name: "connects auth.ts rejecting the now-missing token",
            pass: citesAuthRejection,
            weight: 0.75,
          },
        ],
        scope: [
          { name: "did NOT edit sessions.ts", pass: sessions === origSessions, weight: 1 },
          { name: "did NOT edit auth.ts", pass: auth === origAuth, weight: 1 },
        ],
        pattern: [
          {
            name: "did not invent a fix for a non-bug",
            pass: !/should (also )?(add|delete|check|invalidate)|the fix is|i (added|changed|fixed)|let'?s add/i.test(
              answer
            ),
            weight: 1,
          },
          {
            name: "did not use edit or write tool",
            pass: !hasCall(toolCalls, "edit") && !hasCall(toolCalls, "write"),
            weight: 1,
          },
        ],
        verification: [
          { name: "no files changed", pass: scope.pass, weight: 1, detail: scope.detail },
        ],
        cleanup: [
          {
            name: "investigated both cited files (read)",
            pass:
              toolCalls.some((c) => c.name === "read" && c.args.includes("sessions.ts")) &&
              toolCalls.some((c) => c.name === "read" && c.args.includes("auth.ts")),
            weight: 2,
          },
        ],
      },
      {
        pass: "Identified the cross-file contradiction: logout deletes the row and auth rejects it.",
        partial: "Leaned toward no-bug but missed part of the evidence or scope.",
        fail: "Invented a fix for a non-bug or edited code.",
      }
    );
  },
};

export default scenario;
