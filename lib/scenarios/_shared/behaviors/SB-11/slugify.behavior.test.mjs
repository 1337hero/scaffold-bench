import { test, expect } from "bun:test";
import { slugify } from "./slugify.mjs";

test("collapses a multi-space group to a single dash", () => {
  expect(slugify("Launch   Checklist")).toBe("launch-checklist");
});

test("collapses tabs and newlines too", () => {
  expect(slugify("a\t b\n c")).toBe("a-b-c");
});

test("trims surrounding whitespace and lowercases", () => {
  expect(slugify("  Hello World  ")).toBe("hello-world");
});

test("a single word is just lowercased", () => {
  expect(slugify("Solo")).toBe("solo");
});
