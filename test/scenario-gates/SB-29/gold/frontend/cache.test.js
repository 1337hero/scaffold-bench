import { describe, it, expect, beforeEach } from "bun:test";
import { get, set, clear } from "./cache.js";

describe("cache", () => {
  beforeEach(() => {
    clear();
  });

  it("Test A: stores a value", () => {
    set("key", "value-from-A");
    expect(get("key")).toBe("value-from-A");
  });

  it("Test B: starts with empty cache", () => {
    expect(get("key")).toBeUndefined();
  });
});
