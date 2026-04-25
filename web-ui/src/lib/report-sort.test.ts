import { describe, expect, test } from "bun:test";
import { sortByScore, sortByMetric } from "./report-sort";
import type { ReportModelAggregate } from "@/types";

function model(id: string, overrides: Partial<ReportModelAggregate> = {}): ReportModelAggregate {
  return {
    model: id,
    source: "local",
    runs: 1,
    scorePct: 0,
    pointsAvg: 0,
    maxAvg: 0,
    totalWallSeconds: 0,
    avgScenarioSeconds: 0,
    avgFirstTokenSeconds: null,
    completionTps: null,
    completionTpsApprox: false,
    promptTps: null,
    promptTpsApprox: false,
    toolCallsTotal: 0,
    requests: 0,
    categories: {},
    scenarioCount: 0,
    latestTimestamp: "",
    ...overrides,
  };
}

describe("sortByScore", () => {
  test("sorts descending by scorePct without mutating input", () => {
    const input = [
      model("a", { scorePct: 30 }),
      model("b", { scorePct: 90 }),
      model("c", { scorePct: 60 }),
    ];
    const sorted = sortByScore(input);
    expect(sorted.map((m) => m.model)).toEqual(["b", "c", "a"]);
    expect(input.map((m) => m.model)).toEqual(["a", "b", "c"]);
  });
});

describe("sortByMetric", () => {
  test("filters out null metric values", () => {
    const input = [
      model("a", { completionTps: 10 }),
      model("b", { completionTps: null }),
      model("c", { completionTps: 30 }),
    ];
    const sorted = sortByMetric(input, (m) => m.completionTps);
    expect(sorted.map((m) => m.model)).toEqual(["c", "a"]);
  });

  test("default direction is higher-is-better", () => {
    const input = [model("slow", { completionTps: 5 }), model("fast", { completionTps: 50 })];
    expect(sortByMetric(input, (m) => m.completionTps).map((m) => m.model)).toEqual([
      "fast",
      "slow",
    ]);
  });

  test("lowerIsBetter inverts the order", () => {
    const input = [
      model("slow", { avgScenarioSeconds: 10 }),
      model("fast", { avgScenarioSeconds: 2 }),
    ];
    expect(sortByMetric(input, (m) => m.avgScenarioSeconds, true).map((m) => m.model)).toEqual([
      "fast",
      "slow",
    ]);
  });
});
