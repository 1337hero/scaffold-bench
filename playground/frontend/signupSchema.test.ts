import { test, expect } from "bun:test";
import { signupSchema } from "./signupSchema";

test("rejects an invalid email", () => {
  const r = signupSchema.safeParse({ email: "not-an-email", password: "abcdefgh", name: "Ada" });
  expect(r.success).toBe(false);
});

test("rejects a too-short password", () => {
  const r = signupSchema.safeParse({ email: "ada@example.com", password: "short", name: "Ada" });
  expect(r.success).toBe(false);
});

test("rejects an empty name", () => {
  const r = signupSchema.safeParse({ email: "ada@example.com", password: "abcdefgh", name: "" });
  expect(r.success).toBe(false);
});

test("accepts fully valid input", () => {
  const r = signupSchema.safeParse({ email: "ada@example.com", password: "abcdefgh", name: "Ada" });
  expect(r.success).toBe(true);
});
