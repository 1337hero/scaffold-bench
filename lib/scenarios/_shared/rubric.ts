import { Evaluation } from "../../scoring.ts";
import type { Check, ScenarioEvaluation, RubricBreakdown } from "../../scoring.ts";

// ── Locked thresholds (Part 6 spec) ──────────────────────
// points >= 9 → pass, points 5-8 → partial, points <= 4 → fail
const PASS_THRESHOLD = 9;
const PARTIAL_THRESHOLD = 5;

// ── Dimension caps ───────────────────────────────────────
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

  // Flatten all checks into a flat Check[] for backwards compatibility
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
  return Evaluation.fail(maxPoints, checks, labels.fail, rubricKind, breakdown);
}
