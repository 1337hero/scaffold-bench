import { describe, expect, test } from "bun:test";
import { wrapText } from "./canvas-text";

const monoMeasure = (s: string) => s.length;

describe("wrapText", () => {
  test("single line when under width", () => {
    expect(wrapText(monoMeasure, "hello", 100)).toEqual(["hello"]);
  });

  test("wraps at word boundaries", () => {
    expect(wrapText(monoMeasure, "hello world again", 11)).toEqual(["hello world", "again"]);
  });

  test("falls back to char-level break for long words", () => {
    expect(wrapText(monoMeasure, "supercalifragilistic", 5)).toEqual([
      "super",
      "calif",
      "ragil",
      "istic",
    ]);
  });

  test("preserves explicit line breaks", () => {
    expect(wrapText(monoMeasure, "line1\nline2", 100)).toEqual(["line1", "line2"]);
  });

  test("empty string returns one line", () => {
    expect(wrapText(monoMeasure, "", 100)).toEqual([""]);
  });
});
