import { describe, it, expect } from "bun:test";
import { get, set } from "./cache.js";

describe("cache", () => {
  it("Test A: stores a value", () => {
    set("key", "value-from-A");
    expect(get("key")).toBe("value-from-A");
  });

  it("Test B: starts with empty cache", () => {
    // Fails when run after Test A because module-level state is shared
    expect(get("key")).toBeUndefined();
  });
});
