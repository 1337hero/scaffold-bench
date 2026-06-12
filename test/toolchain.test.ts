import { describe, it, expect } from "bun:test";
import { hasTool } from "../lib/scenarios/_shared/toolchain.js";

describe("hasTool", () => {
  it("returns true for bun", () => {
    expect(hasTool("bun")).toBe(true);
  });

  it("returns false for non-existent binary", () => {
    expect(hasTool("definitely-not-a-real-binary-xyz123")).toBe(false);
  });
});
