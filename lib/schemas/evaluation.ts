import type { Check } from "./run-file.js";

export type RubricBreakdown = {
  correctness: number;
  scope: number;
  pattern: number;
  verification: number;
  cleanup: number;
};

export type PassEvaluation = {
  status: "pass";
  points: number;
  maxPoints: number;
  checks: Check[];
  summary: string;
  rubricKind?: string;
  rubricBreakdown?: RubricBreakdown;
};
export type PartialEvaluation = {
  status: "partial";
  points: number;
  maxPoints: number;
  checks: Check[];
  summary: string;
  rubricKind?: string;
  rubricBreakdown?: RubricBreakdown;
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
};
export type ScenarioEvaluation = PassEvaluation | PartialEvaluation | FailEvaluation;

export const Evaluation = {
  pass: (
    maxPoints: number,
    checks: Check[],
    summary: string,
    rubricKind?: string,
    rubricBreakdown?: RubricBreakdown,
    points = maxPoints
  ): PassEvaluation => ({
    status: "pass",
    points,
    maxPoints,
    checks,
    summary,
    ...(rubricKind ? { rubricKind } : {}),
    ...(rubricBreakdown ? { rubricBreakdown } : {}),
  }),
  partial: (
    points: number,
    maxPoints: number,
    checks: Check[],
    summary: string,
    rubricKind?: string,
    rubricBreakdown?: RubricBreakdown
  ): PartialEvaluation => ({
    status: "partial",
    points,
    maxPoints,
    checks,
    summary,
    ...(rubricKind ? { rubricKind } : {}),
    ...(rubricBreakdown ? { rubricBreakdown } : {}),
  }),
  fail: (
    maxPoints: number,
    checks: Check[],
    summary: string,
    rubricKind?: string,
    rubricBreakdown?: RubricBreakdown,
    points = 0
  ): FailEvaluation => ({
    status: "fail",
    points,
    maxPoints,
    checks,
    summary,
    ...(rubricKind ? { rubricKind } : {}),
    ...(rubricBreakdown ? { rubricBreakdown } : {}),
  }),
};
