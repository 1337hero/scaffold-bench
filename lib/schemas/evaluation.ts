import type { Check } from "./run-file.js";

export type PassEvaluation = {
  status: "pass";
  points: number;
  maxPoints: number;
  checks: Check[];
  summary: string;
};
export type PartialEvaluation = {
  status: "partial";
  points: number;
  maxPoints: number;
  checks: Check[];
  summary: string;
};
export type FailEvaluation = {
  status: "fail";
  points: 0;
  maxPoints: number;
  checks: Check[];
  summary: string;
};
export type ScenarioEvaluation = PassEvaluation | PartialEvaluation | FailEvaluation;

export const Evaluation = {
  pass: (maxPoints: number, checks: Check[], summary: string): PassEvaluation => ({
    status: "pass",
    points: maxPoints,
    maxPoints,
    checks,
    summary,
  }),
  partial: (
    points: number,
    maxPoints: number,
    checks: Check[],
    summary: string
  ): PartialEvaluation => ({
    status: "partial",
    points,
    maxPoints,
    checks,
    summary,
  }),
  fail: (maxPoints: number, checks: Check[], summary: string): FailEvaluation => ({
    status: "fail",
    points: 0,
    maxPoints,
    checks,
    summary,
  }),
};
