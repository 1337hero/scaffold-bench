# Admin-Only User Listing

## Problem

Admins need to list every account, but no admin-scoped endpoint exists yet.
The codebase already has both an authentication guard (`requireUser`) and a
role guard (`requireAdmin`) in `src/lib/auth.ts` — they are just not wired to
any route. Build the endpoint using the guards that already exist.

## Behavior

- `GET /admin/users`
- Requires authentication AND the `admin` role.
- Order of checks matters: an unauthenticated caller must get `401`
  (`unauthenticated` / `session_expired`), and an authenticated non-admin must
  get `403` (`forbidden`). Do not return `403` to someone who isn't logged in,
  and do not leak the list to a non-admin.
- On success: return `{ "users": [...] }` where each user is
  `{ id, email, role }`, ordered by `id` ascending. Never include
  `password_hash`.

## Constraints

- Reuse `requireUser` and `requireAdmin` from `src/lib/auth.ts`. Do not
  re-implement role or session checks inline.
- All SQL must be parameterized; select only `id, email, role`.
- Put the route in a new file `src/routes/admin.ts` exporting `adminRoutes`,
  and mount it in `src/index.ts` the same way the other routes are mounted.

## File layout

- **Create:** `src/routes/admin.ts`
- **Edit:** `src/index.ts` (mount the new routes).
- Do not modify other route files or `src/lib/auth.ts`.

## Done when

- Admin session → 200 with all users (no password_hash).
- Authenticated non-admin → 403 `forbidden`.
- No session → 401.
