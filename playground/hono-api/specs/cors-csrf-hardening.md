# CORS + CSRF Hardening

## Problem

The API is consumed by a browser SPA served from a single trusted origin. Right
now it sets no CORS headers and performs no cross-site request protection, so any
website can drive state-changing requests against a logged-in user (CSRF). Harden
it WITHOUT breaking the existing same-origin tests (which send no `Origin`
header).

## The trusted origin

- `https://app.example.com` — the ONLY origin allowed to make
  credentialed cross-origin calls.

## Where the pieces live

- App + middleware wiring: `src/index.ts`.
- Hono ships first-party middleware for both concerns — reuse them, do not
  hand-roll header parsing:
  - `import { cors } from "hono/cors"`
  - `import { csrf } from "hono/csrf"`

## What to build

- **Create** `src/lib/security.ts` exporting:
  - `ALLOWED_ORIGIN = "https://app.example.com"`.
  - `corsMiddleware` — `cors({ origin: ALLOWED_ORIGIN, credentials: true })`.
  - `csrfMiddleware` — `csrf({ origin: ALLOWED_ORIGIN })`.
- **Edit** `src/index.ts` to apply BOTH globally, before the routes:
  `app.use("*", corsMiddleware)` then `app.use("*", csrfMiddleware)`.
- **Edit** `src/lib/errors.ts` so the global error handler honors Hono's
  `HTTPException` (the csrf middleware throws one): return
  `err.getResponse()` for an `HTTPException` instead of collapsing it to a
  generic 500. Leave `AppError` handling as-is.

## Behavior requirements

- A request from the allowed origin gets
  `Access-Control-Allow-Origin: https://app.example.com` and
  `Access-Control-Allow-Credentials: true` reflected back.
- A request from any other origin does NOT get that origin reflected in
  `Access-Control-Allow-Origin`.
- A state-changing request (POST/PUT/PATCH/DELETE) carrying a foreign `Origin`
  header is rejected with `403` (CSRF protection).
- Requests with NO `Origin` header (the existing same-origin test traffic) keep
  working unchanged — do not break them.

## File layout

- **Create:** `src/lib/security.ts`.
- **Edit:** `src/index.ts` and `src/lib/errors.ts`.
- Do not modify routes, auth, or schema.

## Done when

- Allowed origin is reflected with credentials.
- Foreign origin is not reflected.
- Foreign-origin POST/DELETE → 403.
- No-Origin requests still succeed (existing tests stay green).
