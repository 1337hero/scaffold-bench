import { test, expect } from "bun:test";
import { getViewState } from "./viewState";

test("loading takes priority", () => {
  expect(getViewState({ isLoading: true, error: null, data: undefined })).toBe("loading");
});

test("an empty result shows the empty state", () => {
  expect(getViewState({ isLoading: false, error: null, data: [] })).toBe("empty");
});
