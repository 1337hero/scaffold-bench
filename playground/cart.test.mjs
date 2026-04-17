import assert from "node:assert/strict";
import { calculateSubtotal } from "./cart.mjs";

assert.equal(
  calculateSubtotal([
    { price: 5, quantity: 2 },
    { price: 3, quantity: 4 },
  ]),
  22
);

assert.equal(calculateSubtotal([]), 0);
