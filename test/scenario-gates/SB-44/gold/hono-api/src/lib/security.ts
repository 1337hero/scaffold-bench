import { cors } from "hono/cors";
import { csrf } from "hono/csrf";

export const ALLOWED_ORIGIN = "https://app.example.com";

export const corsMiddleware = cors({ origin: ALLOWED_ORIGIN, credentials: true });
export const csrfMiddleware = csrf({ origin: ALLOWED_ORIGIN });
