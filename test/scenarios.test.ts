import { describe, test, expect } from "bun:test";
import { scenarios } from "../lib/scenarios.ts";

describe("active scenario suite", () => {
  test("has exactly 25 scenarios", () => {
    expect(scenarios.length).toBe(25);
  });

  test("all IDs are unique", () => {
    const ids = scenarios.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test("kept scenario IDs are present", () => {
    const ids = scenarios.map((s) => s.id);
    const expected = [
      "SB-01",
      "SB-05",
      "SB-06",
      "SB-07",
      "SB-08",
      "SB-09",
      "SB-10",
      "SB-11",
      "SB-12",
      "SB-13",
      "SB-14",
      "SB-15",
      "SB-16",
      "SB-17",
      "SB-18",
      "SB-19",
      "SB-20",
      "SB-21",
      "SB-22",
      "SB-23",
      "SB-26",
      "SB-40",
      "SB-41",
      "SB-42",
      "SB-43",
    ];
    for (const id of expected) {
      expect(ids).toContain(id);
    }
  });

  test("pruned scenario IDs are absent", () => {
    const ids = scenarios.map((s) => s.id);
    const pruned = [
      "SB-02",
      "SB-03",
      "SB-04",
      "SB-24",
      "SB-25",
      "SB-27",
      "SB-28",
      "SB-29",
      "SB-30",
    ];
    for (const id of pruned) {
      expect(ids).not.toContain(id);
    }
  });

  test("every scenario has required fields", () => {
    for (const s of scenarios) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.category).toBeTruthy();
      expect(s.prompt).toBeTruthy();
      expect(s.family).toBeTruthy();
    }
  });

  test("maxPoints values are sane", () => {
    for (const s of scenarios) {
      const max = s.maxPoints ?? 10;
      expect(max).toBeGreaterThan(0);
      expect(max).toBeLessThanOrEqual(10);
    }
  });
});
