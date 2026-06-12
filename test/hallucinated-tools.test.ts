import { describe, expect, it } from "bun:test";
import {
  Evaluation,
  applyHallucinationPenalty,
  hallucinatedToolCalls,
} from "../lib/scoring.ts";
import type { ToolCall } from "../lib/scoring.ts";

function call(name: string, result?: ToolCall["result"]): ToolCall {
  return { name, args: "{}", turn: 0, result };
}

const hallucinated = call("websearch", { ok: false, message: 'unknown tool "websearch"' });
const realFailure = call("edit", { ok: false, message: "file not found: a.ts" });
const fine = call("read", { ok: true, value: "contents" });

describe("hallucinatedToolCalls", () => {
  it("detects unknown-tool results and ignores ordinary failures", () => {
    expect(hallucinatedToolCalls([hallucinated, realFailure, fine])).toEqual([hallucinated]);
    expect(hallucinatedToolCalls([realFailure, fine])).toEqual([]);
  });
});

describe("applyHallucinationPenalty", () => {
  it("deducts one point and downgrades a 9-point 10pt pass to partial", () => {
    const evaluation = Evaluation.pass(
      10,
      [],
      "ok",
      "10pt",
      { correctness: 3, scope: 2, pattern: 2, verification: 1, cleanup: 1 },
      9
    );
    const penalized = applyHallucinationPenalty(evaluation, [hallucinated]);
    expect(penalized.points).toBe(8);
    expect(penalized.status).toBe("partial");
    expect(penalized.maxPoints).toBe(10);
    expect(penalized.checks.at(-1)).toMatchObject({
      name: "no hallucinated tools",
      pass: false,
    });
    expect(penalized.checks.at(-1)?.detail).toContain("websearch");
  });

  it("floors at zero", () => {
    const evaluation = Evaluation.fail(
      10,
      [],
      "bad",
      "10pt",
      { correctness: 0, scope: 0, pattern: 0, verification: 0, cleanup: 0 },
      0
    );
    const penalized = applyHallucinationPenalty(evaluation, [hallucinated]);
    expect(penalized.points).toBe(0);
    expect(penalized.status).toBe("fail");
  });

  it("appends a passing check and changes nothing else for clean traces", () => {
    const evaluation = Evaluation.pass(10, [], "ok", "10pt", undefined, 10);
    const result = applyHallucinationPenalty(evaluation, [fine]);
    expect(result.points).toBe(10);
    expect(result.status).toBe("pass");
    expect(result.checks.at(-1)).toMatchObject({ name: "no hallucinated tools", pass: true });
  });

  it("deducts but preserves status for custom rubrics", () => {
    const evaluation = Evaluation.partial(3, 5, [], "some", "custom-5pt");
    const penalized = applyHallucinationPenalty(evaluation, [hallucinated]);
    expect(penalized.points).toBe(2);
    expect(penalized.status).toBe("partial");
  });
});
