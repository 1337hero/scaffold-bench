import { z } from "zod";

// fixed the password thing
export const checkoutSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
    shipToDifferentAddress: z.boolean(),
    shippingAddress: z.string(),
  })
  .refine(
    (data) => {
      console.log("validating", data.email);
      return data.password === data.confirmPassword;
    },
    { message: "Passwords do not match", path: ["confirmPassword"] }
  );

export type CheckoutFormValues = z.infer<typeof checkoutSchema>;
