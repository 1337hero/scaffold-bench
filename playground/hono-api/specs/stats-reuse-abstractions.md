# Per-User Stats Endpoint (Reuse Existing Abstractions)

## Problem

Add a small `GET /stats` endpoint. The catch: this codebase already has the
building blocks you need spread across a few files — an auth guard, a typed DB
handle, and a structured error class. Reuse them. Do not reinvent
authentication, the DB type, or error handling inline.

## Where the pieces live

- Session auth guard: `requireUser` in `src/lib/auth.ts` (sets `c.get("user")`).
- DB handle type: `DB` in `src/db.ts` (the value is on `c.get("db")`).
- Structured errors: `AppError` in `src/lib/errors.ts`.
- How routes are mounted: see `src/index.ts` (e.g. `app.route("/", itemsRoutes)`).

## Behavior

- `GET /stats`
- Requires auth via the existing `requireUser` guard.
- Returns `{ "itemCount": <number> }` — the count of the authenticated user's
  items where `deleted_at IS NULL`.

## Constraints

- Reuse `requireUser` from `src/lib/auth.ts`; do not re-query the sessions table
  or re-validate the cookie yourself.
- Import the `DB` type from `src/db.ts`; do not declare your own DB type.
- If you need an error path, use `AppError` from `src/lib/errors.ts`; do not
  define a new error class or invent ad-hoc `c.json({ error: ... })` shapes.
- All SQL parameterized; filter `deleted_at IS NULL`.

## File layout

- **Create:** `src/routes/stats.ts` exporting `statsRoutes`.
- **Edit:** `src/index.ts` to mount it.
- Do not modify other files.

## Done when

- Authenticated user → 200 with `{ itemCount }` reflecting only their
  non-deleted items.
- Unauthenticated → 401 (via the reused guard).
