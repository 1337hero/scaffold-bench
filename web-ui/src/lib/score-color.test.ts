import { describe, expect, test } from "bun:test";
import { scoreTextColor, scoreBarColor } from "./score-color";

describe("scoreTextColor", () => {
  test("green at and above 70", () => {
    expect(scoreTextColor(70)).toBe("text-green-main");
    expect(scoreTextColor(100)).toBe("text-green-main");
  });
  test("gold between 40 and 69", () => {
    expect(scoreTextColor(40)).toBe("text-gold");
    expect(scoreTextColor(69.9)).toBe("text-gold");
  });
  test("red below 40", () => {
    expect(scoreTextColor(0)).toBe("text-red-main");
    expect(scoreTextColor(39.9)).toBe("text-red-main");
  });
});

describe("scoreBarColor", () => {
  test("perfect 100 is green", () => {
    expect(scoreBarColor(100)).toBe("bg-green-main");
  });
  test("strictly above 50 is gold (not green at 99.9)", () => {
    expect(scoreBarColor(99.9)).toBe("bg-gold");
    expect(scoreBarColor(50.1)).toBe("bg-gold");
  });
  test("50 and below is red", () => {
    expect(scoreBarColor(50)).toBe("bg-red-main");
    expect(scoreBarColor(0)).toBe("bg-red-main");
  });
});
