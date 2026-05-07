import { describe, test, expect } from "bun:test";
import { scenarios } from "../lib/scenarios/index.js";

describe("active scenario suite", () => {
  test("all IDs are unique", () => {
    const ids = scenarios.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
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
