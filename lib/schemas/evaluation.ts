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
  points: 0;
  maxPoints: number;
  checks: Check[];
  summary: string;
  rubricKind?: string;
  rubricBreakdown?: RubricBreakdown;
};
export type ScenarioEvaluation = PassEvaluation | PartialEvaluation | FailEvaluation;

export const Evaluation = {
  pass: (maxPoints: number, checks: Check[], summary: string, rubricKind?: string, rubricBreakdown?: RubricBreakdown): PassEvaluation => ({
    status: "pass",
    points: maxPoints,
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
  fail: (maxPoints: number, checks: Check[], summary: string, rubricKind?: string, rubricBreakdown?: RubricBreakdown): FailEvaluation => ({
    status: "fail",
    points: 0,
    maxPoints,
    checks,
    summary,
    ...(rubricKind ? { rubricKind } : {}),
    ...(rubricBreakdown ? { rubricBreakdown } : {}),
  }),
};
