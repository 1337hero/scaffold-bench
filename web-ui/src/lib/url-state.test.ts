import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { parseUrl, serializeUrl } from "./url-state";

describe("parseUrl", () => {
  test("empty search returns dashboard view", () => {
    expect(parseUrl("")).toEqual({ name: "dashboard", replayRunId: undefined });
  });
  test("view=history returns history view", () => {
    expect(parseUrl("?view=history")).toEqual({ name: "history" });
  });
  test("replayRunId attaches to dashboard view", () => {
    expect(parseUrl("?replayRunId=run-42")).toEqual({
      name: "dashboard",
      replayRunId: "run-42",
    });
  });
  test("view=history wins over replayRunId", () => {
    expect(parseUrl("?view=history&replayRunId=run-42")).toEqual({ name: "history" });
  });
});

describe("serializeUrl", () => {
  const originalLocation = globalThis.window?.location;
  beforeEach(() => {
    (
      globalThis as unknown as { window: { location: { pathname: string }; history: object } }
    ).window = {
      location: { pathname: "/" },
      history: {},
    };
  });
  afterEach(() => {
    if (originalLocation) {
      (globalThis as unknown as { window: { location: typeof originalLocation } }).window.location =
        originalLocation;
    }
  });

  test("history view becomes ?view=history", () => {
    expect(serializeUrl({ name: "history" })).toBe("?view=history");
  });
  test("dashboard with no replay returns pathname", () => {
    expect(serializeUrl({ name: "dashboard" })).toBe("/");
  });
  test("dashboard with replay encodes replayRunId", () => {
    expect(serializeUrl({ name: "dashboard", replayRunId: "run-7" })).toBe("?replayRunId=run-7");
  });
  test("parseUrl(serializeUrl(x)) is identity for history", () => {
    const view = { name: "history" } as const;
    expect(parseUrl(serializeUrl(view))).toEqual(view);
  });
  test("parseUrl(serializeUrl(x)) is identity for dashboard with replay", () => {
    const view = { name: "dashboard", replayRunId: "run-7" } as const;
    expect(parseUrl(serializeUrl(view))).toEqual(view);
  });
});
