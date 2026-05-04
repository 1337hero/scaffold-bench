import { Evaluation } from "../../scoring.ts";
import type { Check, ScenarioEvaluation, RubricBreakdown } from "../../scoring.ts";

// ── Locked thresholds (Part 6 spec) ──────────────────────
// points >= 9 → pass, points 5-8 → partial, points <= 4 → fail
const PASS_THRESHOLD = 9;
const PARTIAL_THRESHOLD = 5;

/**
 * 10-point rubric dimension caps. Sum = 10. Locked.
 *
 * Dimension semantics — the source of truth for what each dimension measures.
 * Drift across scenarios will produce noisy dashboard charts, so each scenario
 * MUST place its checks under the correct dimension:
 *
 * - **correctness (3 pts)** — End-state behavior. Did the change actually
 *   solve the stated problem? Evidenced by either (a) regex/AST patterns over
 *   the resulting file, OR (b) a behavioral test passing under the evaluator's
 *   own control. NOT for "the model ran the right command sequence" — that's
 *   verification.
 *
 * - **scope (2 pts)** — Filesystem-level scope. Did the model touch only the
 *   files (or sub-files) the task allowed? Includes "did NOT modify X" checks
 *   for sibling files. Filesystem-diff based; catches sed-via-bash mutations.
 *
 * - **pattern (2 pts)** — Style / idiom / API adherence. Did the model use
 *   the established stack and existing abstractions instead of reinventing?
 *   Things like "uses TanStack Query", "imports from existing apiClient",
 *   "doesn't add new HTTP libraries". NOT a junk-drawer for unrelated checks.
 *
 * - **verification (1 pt)** — Process compliance / tool-call traces. Did the
 *   model use the right *process* — read before edit, search before edit,
 *   ran the failing test before changing code, reran the test after, etc.
 *   These are checks against `toolCalls` and bash exit codes the model
 *   triggered, NOT against final code state.
 *
 * - **cleanup (2 pts)** — Junk left behind. Added comments, stray
 *   console.log, dead imports, commented-out lines, gratuitous file moves.
 *   NOT for "did the feature work" — that's correctness.
 */
const DIMENSION_CAPS = {
  correctness: 3,
  scope: 2,
  pattern: 2,
  verification: 1,
  cleanup: 2,
} as const;

export type DimensionName = keyof typeof DIMENSION_CAPS;

export type RubricCheck = {
  name: string;
  pass: boolean;
  weight: number;
  detail?: string;
};

export type RubricDimension = RubricCheck[];

export type RubricInput = {
  correctness: RubricDimension;
  scope: RubricDimension;
  pattern: RubricDimension;
  verification: RubricDimension;
  cleanup: RubricDimension;
};

function sumDimension(checks: RubricDimension, cap: number): number {
  const total = checks.reduce((sum, c) => sum + (c.pass ? c.weight : 0), 0);
  return Math.min(total, cap);
}

export function rubricToEvaluation(
  input: RubricInput,
  labels: { pass: string; partial: string; fail: string }
): ScenarioEvaluation {
  const breakdown: RubricBreakdown = {
    correctness: sumDimension(input.correctness, DIMENSION_CAPS.correctness),
    scope: sumDimension(input.scope, DIMENSION_CAPS.scope),
    pattern: sumDimension(input.pattern, DIMENSION_CAPS.pattern),
    verification: sumDimension(input.verification, DIMENSION_CAPS.verification),
    cleanup: sumDimension(input.cleanup, DIMENSION_CAPS.cleanup),
  };

  const points =
    breakdown.correctness +
    breakdown.scope +
    breakdown.pattern +
    breakdown.verification +
    breakdown.cleanup;

  const maxPoints = 10;
  const rubricKind = "10pt";

  // Flatten checks for the legacy Check[] consumers (dashboards, exports).
  // The authoritative per-dimension data lives in `breakdown`.
  const checks: Check[] = [
    ...input.correctness,
    ...input.scope,
    ...input.pattern,
    ...input.verification,
    ...input.cleanup,
  ];

  if (points >= PASS_THRESHOLD) {
    return Evaluation.pass(maxPoints, checks, labels.pass, rubricKind, breakdown, points);
  }
  if (points >= PARTIAL_THRESHOLD) {
    return Evaluation.partial(points, maxPoints, checks, labels.partial, rubricKind, breakdown);
  }
  // Fail status, but raw earned points preserved — a 4/10 fail is distinct
  // from a 0/10 fail in aggregate dashboards and per-dimension comparisons.
  return Evaluation.fail(maxPoints, checks, labels.fail, rubricKind, breakdown, points);
}
