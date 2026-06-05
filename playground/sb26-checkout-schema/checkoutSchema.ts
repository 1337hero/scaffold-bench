import { z } from "zod";

// Users report two bad submits slip through:
//  1. password and confirmPassword can differ.
//  2. when shipToDifferentAddress is true, shippingAddress can be blank.
// The base shape validates each field in isolation but never cross-checks them.
export const checkoutSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
  shipToDifferentAddress: z.boolean(),
  shippingAddress: z.string(),
});

export type CheckoutFormValues = z.infer<typeof checkoutSchema>;
