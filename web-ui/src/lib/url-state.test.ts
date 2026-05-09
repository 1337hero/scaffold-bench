import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { parseUrl, serializeUrl } from "./url-state";

describe("parseUrl", () => {
  test("empty search returns dashboard view", () => {
    expect(parseUrl("")).toEqual({ name: "dashboard" });
  });
  test("view=history returns history view", () => {
    expect(parseUrl("?view=history")).toEqual({ name: "history" });
  });
  test("view=oneshot returns oneshot view", () => {
    expect(parseUrl("?view=oneshot")).toEqual({ name: "oneshot" });
  });
  test("unknown params return dashboard view", () => {
    expect(parseUrl("?replayRunId=run-42")).toEqual({ name: "dashboard" });
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
  test("dashboard returns pathname", () => {
    expect(serializeUrl({ name: "dashboard" })).toBe("/");
  });
  test("parseUrl(serializeUrl(x)) is identity for history", () => {
    const view = { name: "history" } as const;
    expect(parseUrl(serializeUrl(view))).toEqual(view);
  });
  test("oneshot view becomes ?view=oneshot", () => {
    expect(serializeUrl({ name: "oneshot" })).toBe("?view=oneshot");
  });
  test("parseUrl(serializeUrl(x)) is identity for oneshot", () => {
    const view = { name: "oneshot" } as const;
    expect(parseUrl(serializeUrl(view))).toEqual(view);
  });
  test("parseUrl(serializeUrl(x)) is identity for dashboard", () => {
    const view = { name: "dashboard" } as const;
    expect(parseUrl(serializeUrl(view))).toEqual(view);
  });
});
