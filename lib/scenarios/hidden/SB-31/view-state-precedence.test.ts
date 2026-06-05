// Hidden correctness test for SB-31. Runs from the fixture's __hidden__/ subdir.
// Exhaustively checks the loading > error > empty > ready precedence, including
// the two reported glitches (empty array, error-with-stale-data).
import { test, expect } from "bun:test";
import { getViewState } from "../viewState";

test("loading wins even if data/error are present", () => {
  expect(getViewState({ isLoading: true, error: new Error("x"), data: [1] })).toBe("loading");
});

test("error wins over empty when not loading", () => {
  expect(getViewState({ isLoading: false, error: new Error("x"), data: [] })).toBe("error");
});

test("error after stale data is surfaced, not swallowed", () => {
  expect(getViewState({ isLoading: false, error: new Error("x"), data: [1, 2] })).toBe("error");
});

test("empty array maps to empty", () => {
  expect(getViewState({ isLoading: false, error: null, data: [] })).toBe("empty");
});

test("undefined data with no error maps to empty", () => {
  expect(getViewState({ isLoading: false, error: null, data: undefined })).toBe("empty");
});

test("non-empty data with no error maps to ready", () => {
  expect(getViewState({ isLoading: false, error: null, data: [1] })).toBe("ready");
});
