# Admin Audit Log

## Problem

Compliance wants an audit trail of every admin-triggered mutation. We need a table, a helper to write rows, and one real admin route that uses it to prove the pattern.

## Data

- New table `audit_events`:
  - `id` INTEGER PK autoincrement
  - `actor_id` INTEGER NOT NULL, FK `users(id)`
  - `action` TEXT NOT NULL (e.g. `"user.role_update"`)
  - `target_type` TEXT NOT NULL (e.g. `"user"`)
  - `target_id` INTEGER NULL
  - `metadata` TEXT NULL (JSON-encoded blob)
  - `created_at` INTEGER NOT NULL DEFAULT `(unixepoch())`
- Index on `(actor_id, created_at DESC)`.
- Add to `schema.sql`.

## Helper

- New file `src/lib/audit.ts` exporting:
  ```ts
  logAudit(
    c: Context,
    action: string,
    target: { type: string; id?: number },
    metadata?: Record<string, unknown>
  ): void
  ```
- Reads `db` and `user` from the Hono context.
- Inserts one row into `audit_events`. `metadata` is JSON-stringified if present.
- If no authenticated user is on the context, log a warning to `console.warn` and return without inserting.

## Route

One real admin route that exercises the helper:

- `PATCH /admin/users/:id/role`
- Body: `{ "role": "user" | "admin" }`.
- Behind `requireUser` + `requireAdmin`.
- Updates the target user's role.
- On success, calls `logAudit(c, "user.role_update", { type: "user", id }, { from, to })`.
- Invalid role value → 400. Target user not found → 404.

## File layout

- **New:** `src/lib/audit.ts`, `src/routes/admin.ts` (export `adminRoutes`).
- **Edit:** `schema.sql`, `src/index.ts` (mount `adminRoutes`).
- Do not modify `src/routes/users.ts`, `sessions.ts`, or `items.ts`.

## Done when

- Non-admin hitting `PATCH /admin/users/:id/role` → 403 and no row written to `audit_events`.
- Admin with valid body → 200, user's role updated, exactly one row in `audit_events` with matching `action`, `target_type`, `target_id`, and a `metadata` JSON string containing `from` and `to`.
- Invalid role → 400, no row written.
