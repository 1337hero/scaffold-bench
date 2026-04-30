import { useForm } from "react-hook-form";
import { apiClient } from "./apiClient";

// BROKEN — useForm() is missing the zodResolver.
// Validation only runs server-side; client types are loose.

type FormValues = {
  email: string;
  password: string;
  name: string;
};

export function SignupForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>();

  const onSubmit = async (data: FormValues) => {
    await apiClient.post("/auth/signup", data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label htmlFor="name">Name</label>
        <input id="name" {...register("name")} />
        {errors.name && <span>{errors.name.message}</span>}
      </div>
      <div>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" {...register("email")} />
        {errors.email && <span>{errors.email.message}</span>}
      </div>
      <div>
        <label htmlFor="password">Password</label>
        <input id="password" type="password" {...register("password")} />
        {errors.password && <span>{errors.password.message}</span>}
      </div>
      <button type="submit" disabled={isSubmitting}>
        Sign Up
      </button>
    </form>
  );
}
