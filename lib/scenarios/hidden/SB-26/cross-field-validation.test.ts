// Hidden correctness test for SB-26. Runs from the fixture's __hidden__/ subdir,
// so it imports the submitted schema via a ../ relative path. Proves the schema
// enforces the two cross-field rules a base z.object cannot express on its own.
import { test, expect } from "bun:test";
import { checkoutSchema } from "../checkoutSchema";

const base = {
  email: "a@b.com",
  password: "abcdefgh",
  confirmPassword: "abcdefgh",
  shipToDifferentAddress: false,
  shippingAddress: "",
};

test("matching passwords are accepted", () => {
  expect(checkoutSchema.safeParse(base).success).toBe(true);
});

test("mismatched passwords are rejected", () => {
  expect(checkoutSchema.safeParse({ ...base, confirmPassword: "zzzzzzzz" }).success).toBe(false);
});

test("missing shipping address is rejected when shipping elsewhere", () => {
  expect(
    checkoutSchema.safeParse({ ...base, shipToDifferentAddress: true, shippingAddress: "" }).success
  ).toBe(false);
});

test("provided shipping address is accepted when shipping elsewhere", () => {
  expect(
    checkoutSchema.safeParse({
      ...base,
      shipToDifferentAddress: true,
      shippingAddress: "1 Main St",
    }).success
  ).toBe(true);
});

test("blank shipping address is fine when not shipping elsewhere", () => {
  expect(
    checkoutSchema.safeParse({ ...base, shipToDifferentAddress: false, shippingAddress: "" })
      .success
  ).toBe(true);
});
