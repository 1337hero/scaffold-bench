import type { Context } from "hono";

export class AppError extends Error {
  constructor(
    message: string,
    public status: number = 400,
    public code: string = "bad_request"
  ) {
    super(message);
  }
}

export function errorMiddleware(err: Error, c: Context) {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status);
  }
  console.error(err);
  return c.json({ error: { code: "internal", message: "internal server error" } }, 500);
}
