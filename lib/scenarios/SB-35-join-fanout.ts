import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  changedPaths,
  firstChangeTurn,
  onlyChangedFiles,
  readOrEmpty,
  readTurnsForPath,
} from "./_shared/helpers.js";

const PROMPT = `Our order totals report is producing inflated numbers. An order with 3 line items and 2 shipments is showing 6× the actual total. The query is in \`playground/sql-reports/queries/totals.sql\` — fix the SQL without touching \`db.ts\`.`;

export const meta = {
  id: "SB-35",
  name: "join-fanout",
  category: "surgical-edit" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/sql-reports/",
  prompt: PROMPT,
} as const;

function readSync(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function runTotalsQuery(sqlReportsDir: string): { client_id: number; total: number }[] {
  const db = new Database(":memory:");
  db.exec(readSync(join(sqlReportsDir, "schema.sql")));
  db.exec(readSync(join(sqlReportsDir, "seed.sql")));
  const query = readSync(join(sqlReportsDir, "queries/totals.sql"));
  return db.query(query).all() as { client_id: number; total: number }[];
}

const scenario: Scenario = {
  id: "SB-35" as ScenarioId,
  name: "join-fanout",
  category: "surgical-edit",
  family: "regex-style",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const sqlDir = join(playgroundDir, "playground/sql-reports");
    const totalsPath = join(sqlDir, "queries/totals.sql");

    const totalsSQL = await readOrEmpty(totalsPath);

    let rows: { client_id: number; total: number }[] = [];
    let queryError = false;
    try {
      rows = runTotalsQuery(sqlDir);
    } catch {
      queryError = true;
    }

    // With seed data: client 1 has orders 1+2, items: 100+50+200=350. Order 1 has 2 shipments.
    // Correct totals: client 1=350, client 2=75
    // Buggy totals: client 1 gets order 1 doubled → (100+50)*2 + 200 = 500, client 2=75
    const client1Row = rows.find((r) => r.client_id === 1);
    const client1Total = client1Row?.total ?? 0;
    const correctTotal = !queryError && Math.abs(client1Total - 350) < 0.01;

    const dbTsChanged = changedPaths(toolCalls).some((p) => p.includes("db.ts"));

    const usesSubquery =
      /JOIN\s*\(\s*SELECT/i.test(totalsSQL) ||
      /FROM\s*\(\s*SELECT/i.test(totalsSQL) ||
      /WITH\s+\w+/i.test(totalsSQL);
    const noDistinctBandaid =
      !/SELECT\s+DISTINCT\s+o\.client_id/i.test(totalsSQL) &&
      !/DISTINCT\s+oi\.amount/i.test(totalsSQL);

    const changeTurn = firstChangeTurn(toolCalls);
    const readBeforeEdit =
      changeTurn !== undefined &&
      readTurnsForPath(toolCalls, "playground/sql-reports/queries/totals.sql").some(
        (t) => t < changeTurn
      );

    const hasCommentedSQL = /^\s*--.*SELECT/m.test(totalsSQL);

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/sql-reports/queries/totals.sql"],
    });

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "client 1 total is 350 (not double-counted)",
            pass: correctTotal,
            weight: 3,
            detail: queryError
              ? "query threw an error"
              : `client 1 total = ${client1Total}, expected 350`,
          },
        ],
        scope: [
          {
            name: "only totals.sql changed, db.ts untouched",
            pass: scope.pass && !dbTsChanged,
            weight: 2,
            detail: dbTsChanged ? "db.ts was modified" : scope.detail,
          },
        ],
        pattern: [
          {
            name: "uses subquery/derived table (not DISTINCT bandaid)",
            pass: usesSubquery && noDistinctBandaid,
            weight: 2,
            detail: !usesSubquery
              ? "no subquery found"
              : !noDistinctBandaid
                ? "used DISTINCT as bandaid instead of subquery"
                : undefined,
          },
        ],
        verification: [
          {
            name: "read totals.sql before editing",
            pass: readBeforeEdit,
            weight: 1,
          },
        ],
        cleanup: [
          {
            name: "no commented-out SQL experiments",
            pass: !hasCommentedSQL,
            weight: 2,
            detail: hasCommentedSQL ? "commented-out SQL found in file" : undefined,
          },
        ],
      },
      {
        pass: "Join fanout fixed with subquery; totals correct.",
        partial: "Partial fix — some checks failing.",
        fail: "Query still produces inflated totals or db.ts was modified.",
      }
    );
  },
};

export default scenario;
