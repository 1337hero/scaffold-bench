import { describe, test, expect } from "bun:test";
import { scenarios } from "../lib/scenarios.ts";

describe("active scenario suite", () => {
  test("has exactly 30 scenarios", () => {
    expect(scenarios.length).toBe(30);
  });

  test("all IDs are unique", () => {
    const ids = scenarios.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test("IDs are contiguous SB-01 through SB-30", () => {
    const ids = scenarios.map((s) => s.id).toSorted();
    const expected = Array.from({ length: 30 }, (_, i) => `SB-${String(i + 1).padStart(2, "0")}`);
    expect(ids).toEqual(expected);
  });

  test("core IDs SB-01 through SB-04 are present", () => {
    const ids = scenarios.map((s) => s.id);
    for (let i = 1; i <= 4; i++) {
      expect(ids).toContain(`SB-${String(i).padStart(2, "0")}`);
    }
  });

  test("frontend IDs SB-05 through SB-12 are present", () => {
    const ids = scenarios.map((s) => s.id);
    for (let i = 5; i <= 12; i++) {
      expect(ids).toContain(`SB-${String(i).padStart(2, "0")}`);
    }
  });

  test("verify IDs SB-13 through SB-16 are present", () => {
    const ids = scenarios.map((s) => s.id);
    for (let i = 13; i <= 16; i++) {
      expect(ids).toContain(`SB-${String(i).padStart(2, "0")}`);
    }
  });

  test("hono IDs SB-17 through SB-21 are present", () => {
    const ids = scenarios.map((s) => s.id);
    for (let i = 17; i <= 21; i++) {
      expect(ids).toContain(`SB-${String(i).padStart(2, "0")}`);
    }
  });

  test("SB-22 and SB-23 are present", () => {
    const ids = scenarios.map((s) => s.id);
    expect(ids).toContain("SB-22");
    expect(ids).toContain("SB-23");
  });

  test("every scenario has required fields", () => {
    for (const s of scenarios) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.category).toBeTruthy();
      expect(s.prompt).toBeTruthy();
    }
  });

  test("maxPoints values are sane", () => {
    for (const s of scenarios) {
      const max = s.maxPoints ?? 2;
      expect(max).toBeGreaterThan(0);
      expect(max).toBeLessThanOrEqual(5);
    }
  });
});
