#!/usr/bin/env bun
/**
 * Paired per-scenario comparison between two models — which scenarios each
 * one solves, where they diverge, and whether the divergence is significant.
 *
 * Usage:
 *   bun scripts/compare-models.ts <modelA> <modelB>
 */
import { getDb, runMigrations } from "../server/db/migrations.ts";

const GOLD = "\x1b[33m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export type SolveRow = { scenarioId: string; correctness: number | null };

export function scenarioSolveRates(rows: SolveRow[]): Map<string, { n: number; solveRate: number }> {
  const groups = new Map<string, { n: number; solved: number }>();
  for (const row of rows) {
    let g = groups.get(row.scenarioId);
    if (!g) {
      g = { n: 0, solved: 0 };
      groups.set(row.scenarioId, g);
    }
    g.n++;
    if (row.correctness === 3) g.solved++;
  }
  const rates = new Map<string, { n: number; solveRate: number }>();
  for (const [scenarioId, g] of groups) rates.set(scenarioId, { n: g.n, solveRate: g.solved / g.n });
  return rates;
}

export function binomialPMF(n: number, k: number, p = 0.5): number {
  let pmf = (1 - p) ** n;
  for (let i = 1; i <= k; i++) pmf *= ((n - i + 1) / i) * (p / (1 - p));
  return pmf;
}

export function signTestPValue(wins: number, losses: number): number {
  const n = wins + losses;
  if (n === 0) return 1;
  const k = Math.min(wins, losses);
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += binomialPMF(n, i);
  return Math.min(1, 2 * tail);
}

function fetchSolveRows(model: string): SolveRow[] {
  const db = getDb();
  return db
    .query(
      `
      SELECT sr.scenario_id AS scenarioId, sr.correctness AS correctness
      FROM scenario_runs sr
      JOIN runs r ON r.id = sr.run_id
      WHERE r.model = ? AND sr.rubric_kind = '10pt'
        AND sr.status IN ('pass','partial','fail')
        AND (sr.error_kind IS NULL OR sr.error_kind NOT IN ('infra','aborted'))
      `
    )
    .all(model) as SolveRow[];
}

if (import.meta.main) {
  const [modelA, modelB] = Bun.argv.slice(2);
  if (!modelA || !modelB) {
    console.error("Usage: bun scripts/compare-models.ts <modelA> <modelB>");
    process.exit(1);
  }

  runMigrations();
  const rowsA = fetchSolveRows(modelA);
  const rowsB = fetchSolveRows(modelB);

  if (rowsA.length === 0) {
    console.error(`No runs found for model "${modelA}"`);
    process.exit(1);
  }
  if (rowsB.length === 0) {
    console.error(`No runs found for model "${modelB}"`);
    process.exit(1);
  }

  const ratesA = scenarioSolveRates(rowsA);
  const ratesB = scenarioSolveRates(rowsB);
  const scenarioIds = [...new Set([...ratesA.keys()].filter((id) => ratesB.has(id)))].sort();

  const comparisons = scenarioIds.map((scenarioId) => {
    const a = ratesA.get(scenarioId)!;
    const b = ratesB.get(scenarioId)!;
    return { scenarioId, solveA: a.solveRate, nA: a.n, solveB: b.solveRate, nB: b.n, gap: a.solveRate - b.solveRate };
  });

  const top15 = comparisons.toSorted((x, y) => Math.abs(y.gap) - Math.abs(x.gap)).slice(0, 15);

  console.log(`\n${CYAN}${modelA}${RESET} vs ${CYAN}${modelB}${RESET} — ${comparisons.length} shared scenarios\n`);
  console.log(`  ${"scenario".padEnd(12)} ${"solveA".padStart(8)} ${"solveB".padStart(8)} ${"gap".padStart(8)}`);
  for (const c of top15) {
    const gapStr = `${c.gap >= 0 ? "+" : ""}${(c.gap * 100).toFixed(1)}%`;
    const color = c.gap > 0 ? GREEN : c.gap < 0 ? RED : DIM;
    console.log(
      `  ${c.scenarioId.padEnd(12)} ${(c.solveA * 100).toFixed(1).padStart(7)}% ${(c.solveB * 100).toFixed(1).padStart(7)}% ${color}${gapStr.padStart(8)}${RESET}`
    );
  }

  const overallA = rowsA.filter((r) => r.correctness === 3).length / rowsA.length;
  const overallB = rowsB.filter((r) => r.correctness === 3).length / rowsB.length;
  console.log(
    `\n  overall solve rate: ${CYAN}${modelA}${RESET} ${(overallA * 100).toFixed(1)}%  vs  ${CYAN}${modelB}${RESET} ${(overallB * 100).toFixed(1)}%`
  );

  const aWins = comparisons.filter((c) => c.gap > 0).length;
  const bWins = comparisons.filter((c) => c.gap < 0).length;
  const tied = comparisons.filter((c) => c.gap === 0).length;
  const pValue = signTestPValue(aWins, bWins);
  console.log(
    `  ${modelA} > ${modelB}: ${aWins}   ${modelB} > ${modelA}: ${bWins}   tied: ${tied}   ${GOLD}sign-test p=${pValue.toFixed(4)}${RESET}\n`
  );
}
