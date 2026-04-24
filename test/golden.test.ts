import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { capturePlainSummary } from "./harness/capture-plain-summary.ts";
import { captureDashboardFinal } from "./harness/capture-dashboard-final.ts";

const read = (p: string): string => readFileSync(join(import.meta.dir, p), "utf8");

describe("golden baselines", () => {
  test("printPlainSummary is byte-identical to golden", () => {
    expect(capturePlainSummary()).toBe(read("golden/plain-summary.txt"));
  });

  test("BenchDashboard.renderFinal is byte-identical to golden", () => {
    expect(captureDashboardFinal()).toBe(read("golden/dashboard-final.txt"));
  });
});
