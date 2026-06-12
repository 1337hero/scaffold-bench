import { afterEach, describe, expect, it } from "bun:test";
import { preflightModel } from "../lib/runtimes/preflight.ts";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

const cfg = { endpoint: "http://localhost:9/v1/chat/completions", model: "m" };

describe("preflightModel", () => {
  it("returns ok with latency for a healthy endpoint", async () => {
    globalThis.fetch = (async () =>
      Response.json({ choices: [{ message: { content: "." } }] })) as typeof fetch;
    const result = await preflightModel(cfg);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("classifies network failures as endpoint_unreachable", async () => {
    globalThis.fetch = (async () => {
      throw new Error("fetch failed: connection refused");
    }) as typeof fetch;
    const result = await preflightModel(cfg);
    expect(result).toMatchObject({ ok: false, reason: "endpoint_unreachable" });
  });

  it("classifies 404 as model_not_found", async () => {
    globalThis.fetch = (async () =>
      new Response('{"error":{"message":"model not found"}}', { status: 404 })) as typeof fetch;
    const result = await preflightModel(cfg);
    expect(result).toMatchObject({ ok: false, reason: "model_not_found" });
  });

  it("classifies 401 as auth", async () => {
    globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
    const result = await preflightModel(cfg);
    expect(result).toMatchObject({ ok: false, reason: "auth" });
  });

  it("classifies other non-2xx as bad_response", async () => {
    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    const result = await preflightModel(cfg);
    expect(result).toMatchObject({ ok: false, reason: "bad_response" });
  });
});
