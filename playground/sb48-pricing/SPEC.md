# Extend the pricing engine: volume discount (preserve existing behavior)

This is a follow-up change to a module that already ships. `pricing.ts` is
covered by `pricing.test.ts`, and **all of those existing tests must keep
passing** — do not regress current behavior.

## New requirement: volume discount

Large orders get an automatic volume discount, on top of any coupon:

- If the **subtotal is ≥ 10000 cents** ($100), apply a **5% volume discount**
  to the subtotal first.
- Any percent coupon then applies to the **amount remaining after the volume
  discount** (i.e. volume discount is applied before the coupon).
- `discountCents` in the result must be the **combined** discount (volume +
  coupon), so `totalCents = subtotal - discountCents + tax`.
- Tax (8%) is charged on the post-discount amount, same as today.
- Orders under 10000 cents are completely unchanged.

### Worked example

Subtotal 20000, coupon 10%:

- Volume discount = 5% of 20000 = 1000 → remaining 19000.
- Coupon = 10% of 19000 = 1900.
- `discountCents` = 1000 + 1900 = 2900.
- taxable = 20000 - 2900 = 17100; tax = round(17100 \* 0.08) = 1368.
- `totalCents` = 17100 + 1368 = 18468.

## Constraints

- Edit only `pricing.ts`. Do not edit `pricing.test.ts`.
- Keep the existing exported signatures (`subtotal`, `priceOrder`, the types).
- Round each discount with `Math.round`, matching the existing coupon code.

## Done when

- Every existing test in `pricing.test.ts` still passes.
- Orders ≥ 10000 cents get the 5% volume discount, combined with any coupon, in
  the order described above.
