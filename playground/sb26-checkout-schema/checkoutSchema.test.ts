import { test, expect } from "bun:test";
import { checkoutSchema } from "./checkoutSchema";

const base = {
  email: "a@b.com",
  password: "abcdefgh",
  confirmPassword: "abcdefgh",
  shipToDifferentAddress: false,
  shippingAddress: "",
};

test("a fully valid, matching submit is accepted", () => {
  expect(checkoutSchema.safeParse(base).success).toBe(true);
});

test("mismatched password confirmation is rejected", () => {
  expect(
    checkoutSchema.safeParse({ ...base, confirmPassword: "different" }).success
  ).toBe(false);
});
