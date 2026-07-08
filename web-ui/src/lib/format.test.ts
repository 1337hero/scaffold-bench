import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  formatElapsed,
  formatTps,
  formatSeconds,
  formatDuration,
  formatRelative,
  formatNowHHMMSS,
  formatWallTime,
} from "./format";

describe("formatElapsed", () => {
  test("zero ms is 00:00", () => {
    expect(formatElapsed(0)).toBe("00:00");
  });
  test("under a minute pads seconds", () => {
    expect(formatElapsed(7_000)).toBe("00:07");
  });
  test("multi-minute walls roll over", () => {
    expect(formatElapsed(125_000)).toBe("02:05");
  });
  test("rounds down sub-second remainder", () => {
    expect(formatElapsed(59_999)).toBe("00:59");
  });
});

describe("formatWallTime", () => {
  test("under 60 seconds shows seconds only", () => {
    expect(formatWallTime(45)).toBe("45s");
  });
  test("zero is 0s", () => {
    expect(formatWallTime(0)).toBe("0s");
  });
  test("60+ seconds shows minutes and seconds", () => {
    expect(formatWallTime(1220)).toBe("20m 20s");
  });
  test("60+ minutes shows hours and minutes", () => {
    expect(formatWallTime(12090)).toBe("3h 21m");
  });
  test("rounds down sub-second remainder", () => {
    expect(formatWallTime(59.9)).toBe("59s");
  });
});

describe("formatTps", () => {
  test("null value renders em-dash", () => {
    expect(formatTps(null, false, 1)).toBe("—");
  });
  test("approx flag prepends tilde", () => {
    expect(formatTps(42.5, true, 1)).toBe("~42.5");
  });
  test("digits controls precision", () => {
    expect(formatTps(42.567, false, 2)).toBe("42.57");
  });
});

describe("formatSeconds", () => {
  test("null value renders em-dash", () => {
    expect(formatSeconds(null, 1)).toBe("—");
  });
  test("appends s suffix at requested precision", () => {
    expect(formatSeconds(1.234, 2)).toBe("1.23s");
  });
});

describe("formatDuration", () => {
  test("null finishedAt renders em-dash", () => {
    expect(formatDuration(0, null)).toBe("—");
  });
  test("under 60 seconds shows seconds", () => {
    expect(formatDuration(0, 45_000)).toBe("45s");
  });
  test("60+ seconds shows minutes and seconds", () => {
    expect(formatDuration(0, 65_000)).toBe("1m 05s");
  });
  test("60+ minutes shows hours and minutes", () => {
    expect(formatDuration(0, 5010_000)).toBe("1h 23m");
  });
});

describe("formatRelative", () => {
  let originalNow: () => number;
  beforeEach(() => {
    originalNow = Date.now;
    Date.now = () => 1_000_000_000_000;
  });
  afterEach(() => {
    Date.now = originalNow;
  });

  test("under one minute is 'just now'", () => {
    expect(formatRelative(Date.now() - 30_000)).toBe("just now");
  });
  test("minutes branch uses m suffix", () => {
    expect(formatRelative(Date.now() - 5 * 60_000)).toBe("5m ago");
  });
  test("hours branch uses h suffix", () => {
    expect(formatRelative(Date.now() - 3 * 3_600_000)).toBe("3h ago");
  });
  test("days branch uses d suffix", () => {
    expect(formatRelative(Date.now() - 4 * 86_400_000)).toBe("4d ago");
  });
});

describe("formatNowHHMMSS", () => {
  test("returns 8-character HH:MM:SS slice", () => {
    const stamp = formatNowHHMMSS();
    expect(stamp).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
