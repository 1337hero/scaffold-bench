import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
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

const PROMPT = `Write a SQL query \`playground/sql-reports/queries/monthly-net-revenue.sql\` that shows monthly net revenue per client (payments minus refunds). Active clients should appear even in months where they only had refunds and no payments. Order by client_id, month.`;

export const meta = {
  id: "SB-37",
  name: "reporting-query",
  category: "implementation" as const,
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

interface NetRevenueRow {
  client_id: number;
  month: string;
  net_revenue: number;
}

function runNetRevenueQuery(
  sqlDir: string,
  extraSeed?: string
): { rows: NetRevenueRow[]; error?: string } {
  try {
    const db = new Database(":memory:");
    db.exec(readSync(join(sqlDir, "schema.sql")));
    db.exec(readSync(join(sqlDir, "seed.sql")));
    if (extraSeed) db.exec(extraSeed);
    const sql = readSync(join(sqlDir, "queries/monthly-net-revenue.sql"));
    if (!sql.trim()) return { rows: [], error: "query file is empty" };
    return { rows: db.query(sql).all() as NetRevenueRow[] };
  } catch (e) {
    return { rows: [], error: String(e) };
  }
}

// Dataset 1: client 1 pays 500 in 2024-01, has 50 refund → net 450 (seed already has this)
// Dataset 2: client 2 has ONLY a 200 refund in 2024-02 (no payment) → net -200 must appear
const EXTRA_SEED_REFUND_ONLY = `INSERT INTO refunds (id, client_id, amount, month) VALUES (99, 2, 200.00, '2024-02');`;

const scenario: Scenario = {
  id: "SB-37" as ScenarioId,
  name: "reporting-query",
  category: "implementation",
  family: "regex-style",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const sqlDir = join(playgroundDir, "playground/sql-reports");
    const queryPath = "playground/sql-reports/queries/monthly-net-revenue.sql";
    const querySQL = await readOrEmpty(join(sqlDir, "queries/monthly-net-revenue.sql"));

    const { rows: rows1, error: err1 } = runNetRevenueQuery(sqlDir);
    const { rows: rows2, error: err2 } = runNetRevenueQuery(sqlDir, EXTRA_SEED_REFUND_ONLY);

    // Dataset 1 check: client 1 net in 2024-01 = 500 - 50 = 450
    const client1Jan = rows1.find((r) => r.client_id === 1 && r.month === "2024-01");
    const dataset1Correct = !err1 && client1Jan !== undefined && Math.abs(client1Jan.net_revenue - 450) < 0.01;

    // Dataset 2 check: client 2 should appear in 2024-02 with net -200 (refund-only month)
    const client2Feb = rows2.find((r) => r.client_id === 2 && r.month === "2024-02");
    const dataset2Correct =
      !err2 && client2Feb !== undefined && Math.abs(client2Feb.net_revenue - -200) < 0.01;

    const correctness = dataset1Correct && dataset2Correct;

    const usesUnionAll = /UNION\s+ALL/i.test(querySQL);
    const usesLeftJoinSubquery =
      /LEFT\s+JOIN/i.test(querySQL) &&
      /SELECT[^)]+FROM\s+(payments|refunds)/i.test(querySQL);
    const noNaiveGroupBy =
      !/^SELECT\s+p\.\s*client_id.*FROM\s+payments\s+p\s+GROUP\s+BY/is.test(querySQL);
    const properPattern = (usesUnionAll || usesLeftJoinSubquery) && noNaiveGroupBy;

    const changeTurn = firstChangeTurn(toolCalls);
    const readSchemaBeforeEdit =
      changeTurn !== undefined &&
      (readTurnsForPath(toolCalls, "playground/sql-reports/schema.sql").some(
        (t) => t < changeTurn
      ) ||
        readTurnsForPath(toolCalls, "playground/sql-reports/seed.sql").some(
          (t) => t < changeTurn
        ));

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [queryPath, "playground/sql-reports/queries/index.ts"],
    });

    const hasCommentedSQL = /^\s*--.*SELECT/m.test(querySQL);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "both datasets correct (net revenue and refund-only month)",
            pass: dataset1Correct && dataset2Correct,
            weight: 3,
            detail: !dataset1Correct
              ? (err1 ?? `client 1 jan: got ${client1Jan?.net_revenue}, expected 450`)
              : !dataset2Correct
              ? (err2 ?? (client2Feb ? `got ${client2Feb.net_revenue}` : "refund-only month row missing"))
              : undefined,
          },
        ],
        scope: [
          {
            name: "only new query file written (schema/seed/existing queries untouched)",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "uses UNION ALL or LEFT JOIN subqueries (not naive single-table GROUP BY)",
            pass: properPattern,
            weight: 2,
            detail: !properPattern
              ? "naive GROUP BY approach misses refund-only months"
              : undefined,
          },
        ],
        verification: [
          {
            name: "read schema or seed before writing query",
            pass: readSchemaBeforeEdit,
            weight: 1,
          },
        ],
        cleanup: [
          {
            name: "no commented-out SQL in query file",
            pass: !hasCommentedSQL,
            weight: 2,
            detail: hasCommentedSQL ? "commented-out SQL found" : undefined,
          },
        ],
      },
      {
        pass: "Monthly net revenue query correct, handles refund-only months.",
        partial: "Query partially correct — some edge cases missing.",
        fail: "Query missing or does not handle refund-only months.",
      }
    );
  },
};

export default scenario;
