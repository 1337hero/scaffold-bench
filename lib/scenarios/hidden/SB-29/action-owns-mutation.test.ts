// Hidden correctness test for SB-29. Runs from the fixture's __hidden__/ subdir.
// Proves the route action owns the mutation: validates first, calls post exactly
// once on valid input with the right path/body, and normalizes both outcomes.
import { test, expect } from "bun:test";
import { projectAction } from "../src/projectAction";

test("calls post exactly once with the projects path and body", async () => {
  const seen: Array<{ path: string; body: unknown }> = [];
  const post = async (path: string, body: unknown) => {
    seen.push({ path, body });
    return { id: "x9" };
  };
  const result = await projectAction(post, { name: "Mercury" });
  expect(seen.length).toBe(1);
  expect(seen[0]?.path).toBe("/projects");
  expect(seen[0]?.body).toEqual({ name: "Mercury" });
  expect(result).toEqual({ ok: true, id: "x9" });
});

test("blank name short-circuits before any network call", async () => {
  let calls = 0;
  const post = async () => {
    calls += 1;
    return { id: "x" };
  };
  const result = await projectAction(post, { name: "" });
  expect(calls).toBe(0);
  expect(result.ok).toBe(false);
});

test("surfaces a server error as a normalized failure result", async () => {
  const message = "500";
  const post = async () => {
    throw new Error(message);
  };
  const result = await projectAction(post, { name: "Gemini" });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(typeof result.error).toBe("string");
});
