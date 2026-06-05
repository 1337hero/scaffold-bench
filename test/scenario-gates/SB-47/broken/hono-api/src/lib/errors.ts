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
    // flatten the error and attach a correlation id
    const requestId = crypto.randomUUID();
    return c.json({ code: err.code, message: err.message, requestId }, err.status);
  }
  console.error(err);
  return c.json({ error: { code: "internal", message: "internal server error" } }, 500);
}
