import { test, expect } from "bun:test";
import { projectAction } from "./projectAction";

test("valid input calls post once and returns the new id", async () => {
  let calls = 0;
  const post = async () => {
    calls += 1;
    return { id: "p1" };
  };
  const result = await projectAction(post, { name: "Apollo" });
  expect(result).toEqual({ ok: true, id: "p1" });
  expect(calls).toBe(1);
});

test("invalid input returns an error and never calls post", async () => {
  let calls = 0;
  const post = async () => {
    calls += 1;
    return { id: "p1" };
  };
  const result = await projectAction(post, { name: "  " });
  expect(result.ok).toBe(false);
  expect(calls).toBe(0);
});
