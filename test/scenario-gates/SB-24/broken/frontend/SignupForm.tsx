import { useForm } from "react-hook-form";
import * as yup from "yup";
import { apiClient } from "./apiClient";

const manualSchema = yup.object({
  email: yup.string().email(),
  password: yup.string().min(8),
  name: yup.string().required(),
});

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
    console.log("submitting", data);
    manualSchema.validate(data);
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
