/**
 * Difficulty calibration — read-only field-wide pass-rate report per scenario,
 * cross-checked against the hand-assigned `difficulty` tags in the registry.
 *
 * Run: `bun scripts/difficulty-calibration.ts`
 *
 * Excludes infra/aborted/timeout scenario-runs (no signal about the scenario's
 * cognitive load) and rows with max_points = 0. Prints per scenario: attempts,
 * mean score %, pass rate, current tag, and a MISMATCH flag when the tag
 * disagrees with the calibration thresholds (≥80 → low, ≤45 → high, else medium).
 *
 * Mismatches are expected after a judgment pass — the field sample is often
 * skewed toward strong models, inflating means so the 45% threshold produces no
 * high tier. Investigate flagged rows, re-tag in the scenario file if the call
 * was wrong, and document the rest in the PR.
 */
import { getDb } from "../server/db/migrations.ts";
import { scenarios } from "../lib/scenarios/index.js";
import type { Difficulty } from "../lib/scenarios/_shared/types.ts";

const LOW_THRESHOLD = 80;
const HIGH_THRESHOLD = 45;

type Row = {
  scenario_id: string;
  n: number;
  mean_pct: number;
  pass_rate: number;
};

function empiricalTier(meanPct: number): Difficulty {
  if (meanPct >= LOW_THRESHOLD) return "low";
  if (meanPct <= HIGH_THRESHOLD) return "high";
  return "medium";
}

const tagById = new Map<string, Difficulty>(scenarios.map((s) => [s.id, s.difficulty]));
const nameById = new Map<string, string>(scenarios.map((s) => [s.id, s.name]));

const rows = getDb()
  .query<Row, []>(
    `SELECT scenario_id,
          COUNT(*)                                                    AS n,
          AVG(CAST(points AS REAL) / max_points) * 100                AS mean_pct,
          AVG(status = 'pass') * 100                                  AS pass_rate
   FROM scenario_runs
   WHERE (error_kind IS NULL OR error_kind = 'runtime')
     AND max_points > 0
   GROUP BY scenario_id
   ORDER BY mean_pct DESC`
  )
  .all();

const header = ["scenario", "name", "n", "mean%", "pass%", "tag", "empirical", "flag"];
const widths = [9, 40, 4, 7, 7, 7, 9, 8];
const pad = (s: string, w: number) => s.padEnd(w);
console.log(header.map((h, i) => pad(h, widths[i])).join("  "));
console.log(widths.map((w) => "-".repeat(w)).join("  "));

let mismatches = 0;
const seen = new Set<string>();
for (const row of rows) {
  seen.add(row.scenario_id);
  const tag = tagById.get(row.scenario_id);
  const empirical = empiricalTier(row.mean_pct);
  const tagLabel = tag ?? "—";
  const mismatch = tag !== undefined && tag !== empirical;
  if (mismatch) mismatches += 1;
  console.log(
    [
      pad(row.scenario_id, widths[0]),
      pad(nameById.get(row.scenario_id) ?? "(missing)", widths[1]),
      pad(String(row.n), widths[2]),
      pad(row.mean_pct.toFixed(1), widths[3]),
      pad(row.pass_rate.toFixed(1), widths[4]),
      pad(tagLabel, widths[5]),
      pad(empirical, widths[6]),
      mismatch ? "MISMATCH" : "",
    ].join("  ")
  );
}

// Registry scenarios with no DB rows yet — untagged empirically, surfaced for awareness.
const untouched = scenarios.filter((s) => !seen.has(s.id));
console.log();
console.log(`${rows.length} scenarios with run data, ${untouched.length} with none.`);
for (const s of untouched) {
  console.log(`  ${s.id} ${s.name} (tag: ${s.difficulty}) — no scenario_runs rows`);
}
console.log();
console.log(
  `${mismatches} tag/empirics mismatch(es). Thresholds: low≥${LOW_THRESHOLD}, high≤${HIGH_THRESHOLD}.`
);
