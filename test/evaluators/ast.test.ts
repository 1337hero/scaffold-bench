import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import {
  importsOf,
  fileCalls,
  componentUsesHook,
  functionOwner,
} from "../../lib/scenarios/_shared/evaluators/index.js";

const gold = join(import.meta.dir, "fixtures", "ast", "gold", "Widget.tsx");
const broken = join(import.meta.dir, "fixtures", "ast", "broken", "Widget.tsx");

describe("importsOf", () => {
  test("gold does not import react-query", () => {
    expect(importsOf(gold)).not.toContain("@tanstack/react-query");
  });
  test("broken imports react-query", () => {
    expect(importsOf(broken)).toContain("@tanstack/react-query");
  });
});

describe("componentUsesHook", () => {
  test("gold Widget does not call useQuery", () => {
    expect(componentUsesHook(gold, "Widget", "useQuery")).toBe(false);
  });
  test("broken Widget calls useQuery", () => {
    expect(componentUsesHook(broken, "Widget", "useQuery")).toBe(true);
  });
});

describe("fileCalls", () => {
  test("gold does not call fetch", () => {
    expect(fileCalls(gold, "fetch")).toBe(false);
  });
  test("broken calls fetch", () => {
    expect(fileCalls(broken, "fetch")).toBe(true);
  });
});

describe("functionOwner", () => {
  test("helper is owned by no component in gold (top-level)", () => {
    expect(functionOwner(gold, "helper")).toBeUndefined();
  });
});
