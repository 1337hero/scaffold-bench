// Hidden correctness test for SB-24. Runs from the fixture's __hidden__/ subdir,
// so it imports the submitted schema via a ../ relative path. Proves the schema
// the resolver must use actually rejects invalid input (so an RHF zodResolver
// wired to it blocks submit) and accepts valid input.
import { test, expect } from "bun:test";
import { signupSchema } from "../signupSchema";

test("invalid email is rejected", () => {
  expect(signupSchema.safeParse({ email: "x", password: "abcdefgh", name: "Ada" }).success).toBe(
    false
  );
});

test("short password is rejected", () => {
  expect(
    signupSchema.safeParse({ email: "a@b.com", password: "1234567", name: "Ada" }).success
  ).toBe(false);
});

test("valid input is accepted", () => {
  expect(
    signupSchema.safeParse({ email: "a@b.com", password: "abcdefgh", name: "Ada" }).success
  ).toBe(true);
});
