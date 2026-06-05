import type { Check } from "./run-file.js";

export type RubricBreakdown = {
  correctness: number;
  scope: number;
  pattern: number;
  verification: number;
  cleanup: number;
};

/** Display-only hidden-test tally. Does NOT affect points/status. */
export type HiddenTestTally = { passed: number; total: number };

export type PassEvaluation = {
  status: "pass";
  points: number;
  maxPoints: number;
  checks: Check[];
  summary: string;
  rubricKind?: string;
  rubricBreakdown?: RubricBreakdown;
  hiddenTests?: HiddenTestTally;
};
export type PartialEvaluation = {
  status: "partial";
  points: number;
  maxPoints: number;
  checks: Check[];
  summary: string;
  rubricKind?: string;
  rubricBreakdown?: RubricBreakdown;
  hiddenTests?: HiddenTestTally;
};
export type FailEvaluation = {
  status: "fail";
  // points is the actual earned-points sum, NOT 0.
  // A fail with 4/10 earned points is meaningfully different from a 0/10 zero.
  // Status-vs-points: status reflects bucketing thresholds; points reflect raw signal.
  points: number;
  maxPoints: number;
  checks: Check[];
  summary: string;
  rubricKind?: string;
  rubricBreakdown?: RubricBreakdown;
  hiddenTests?: HiddenTestTally;
};
export type ScenarioEvaluation = PassEvaluation | PartialEvaluation | FailEvaluation;

export const Evaluation = {
  pass: (
    maxPoints: number,
    checks: Check[],
    summary: string,
    rubricKind?: string,
    rubricBreakdown?: RubricBreakdown,
    points = maxPoints,
    hiddenTests?: HiddenTestTally
  ): PassEvaluation => ({
    status: "pass",
    points,
    maxPoints,
    checks,
    summary,
    ...(rubricKind ? { rubricKind } : {}),
    ...(rubricBreakdown ? { rubricBreakdown } : {}),
    ...(hiddenTests ? { hiddenTests } : {}),
  }),
  partial: (
    points: number,
    maxPoints: number,
    checks: Check[],
    summary: string,
    rubricKind?: string,
    rubricBreakdown?: RubricBreakdown,
    hiddenTests?: HiddenTestTally
  ): PartialEvaluation => ({
    status: "partial",
    points,
    maxPoints,
    checks,
    summary,
    ...(rubricKind ? { rubricKind } : {}),
    ...(rubricBreakdown ? { rubricBreakdown } : {}),
    ...(hiddenTests ? { hiddenTests } : {}),
  }),
  fail: (
    maxPoints: number,
    checks: Check[],
    summary: string,
    rubricKind?: string,
    rubricBreakdown?: RubricBreakdown,
    points = 0,
    hiddenTests?: HiddenTestTally
  ): FailEvaluation => ({
    status: "fail",
    points,
    maxPoints,
    checks,
    summary,
    ...(rubricKind ? { rubricKind } : {}),
    ...(rubricBreakdown ? { rubricBreakdown } : {}),
    ...(hiddenTests ? { hiddenTests } : {}),
  }),
};
