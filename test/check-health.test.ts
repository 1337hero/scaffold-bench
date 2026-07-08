import { describe, test, expect } from "bun:test";
import { flagChecks, type CheckRow } from "../scripts/check-health.ts";

function rows(scenarioId: string, name: string, passes: number, total: number): CheckRow[] {
  return Array.from({ length: total }, (_, i) => ({ scenarioId, name, pass: i < passes }));
}

describe("flagChecks", () => {
  test("flags SATURATED when pass rate >= 97% and n >= 30", () => {
    const [stat] = flagChecks(rows("SB-01", "always passes", 30, 30));
    expect(stat.flag).toBe("SATURATED");
    expect(stat.passRate).toBe(1);
    expect(stat.n).toBe(30);
  });

  test("flags NEVER-PASS when pass rate <= 3% and n >= 30", () => {
    const [stat] = flagChecks(rows("SB-01", "never passes", 0, 30));
    expect(stat.flag).toBe("NEVER-PASS");
  });

  test("does not flag below the sample size floor", () => {
    const [stat] = flagChecks(rows("SB-01", "small sample", 0, 5));
    expect(stat.flag).toBeNull();
  });

  test("does not flag a mid-range pass rate", () => {
    const [stat] = flagChecks(rows("SB-01", "healthy check", 15, 30));
    expect(stat.flag).toBeNull();
    expect(stat.passRate).toBe(0.5);
  });

  test("groups by scenario and check name independently", () => {
    const combined = [...rows("SB-01", "check a", 30, 30), ...rows("SB-02", "check a", 0, 30)];
    const stats = flagChecks(combined);
    expect(stats).toHaveLength(2);
    expect(stats.find((s) => s.scenarioId === "SB-01")?.flag).toBe("SATURATED");
    expect(stats.find((s) => s.scenarioId === "SB-02")?.flag).toBe("NEVER-PASS");
  });

  test("boundary at exactly 97% and 3% flags", () => {
    const [at97] = flagChecks(rows("SB-01", "exactly 97", 97, 100));
    expect(at97.flag).toBe("SATURATED");
    const [at96] = flagChecks(rows("SB-01", "exactly 96", 96, 100));
    expect(at96.flag).toBeNull();
    const [at3] = flagChecks(rows("SB-01", "exactly 3", 3, 100));
    expect(at3.flag).toBe("NEVER-PASS");
    const [at4] = flagChecks(rows("SB-01", "exactly 4", 4, 100));
    expect(at4.flag).toBeNull();
  });
});
