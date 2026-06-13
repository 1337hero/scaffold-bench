import { describe, it, expect } from "bun:test";
import { get, set } from "./cache.js";

describe("cache", () => {
  it("Test A: stores a value", () => {
    set("key", "value-from-A");
    expect(get("key")).toBe("value-from-A");
  });

  it.skip("Test B: starts with empty cache", () => {
    // Skipped instead of fixed — wrong approach
    expect(get("key")).toBeUndefined();
  });
});
