import { z } from "zod";

export const checkoutSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
    shipToDifferentAddress: z.boolean(),
    shippingAddress: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
    if (data.shipToDifferentAddress && data.shippingAddress.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shippingAddress"],
        message: "Shipping address is required",
      });
    }
  });

export type CheckoutFormValues = z.infer<typeof checkoutSchema>;
