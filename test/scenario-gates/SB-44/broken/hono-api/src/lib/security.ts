import type { Context, Next } from "hono";

// Hand-rolled and insecure: reflects whatever Origin the caller sends, and
// there is no CSRF protection at all.
export async function corsMiddleware(c: Context, next: Next) {
  const origin = c.req.header("origin");
  if (origin) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
  }
  await next();
}

export async function csrfMiddleware(_c: Context, next: Next) {
  await next();
}
