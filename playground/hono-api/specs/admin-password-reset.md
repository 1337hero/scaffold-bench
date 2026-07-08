# Admin Password Reset

## Problem

Support gets tickets from users locked out of their accounts. Today admins have no way to reset a user's password without poking the DB directly. Give them a safe, auditable flow.

## Flow

1. Admin calls `POST /admin/password-resets` with `{ "email": "..." }`. System creates a one-time reset token and returns `{ "token": "..." }` in the response body (this stands in for an email send).
2. User calls `POST /password-resets/:token/confirm` with `{ "password": "..." }`. System updates the password hash, consumes the token, and invalidates all existing sessions for that user.
3. Tokens expire after 1 hour. Used tokens cannot be reused.

## Data

- New table `password_resets`: `id`, `user_id` (FK `users`, cascade), `token` (unique, text), `expires_at` (integer, unix seconds), `used_at` (integer, nullable). Add to `schema.sql`. Existing tables stay as-is.

## Implementation notes

- Use `AppError` from `src/lib/errors.ts` for every error response.
- Hash new passwords with `Bun.password.hash`, same pattern as `POST /users`.
- The admin route goes through `requireUser` then `requireAdmin` from `src/lib/auth.ts`.
- The confirm route is public — the user is locked out and has no session.
- Generate tokens the same way `sessions.ts` does (`crypto.randomUUID().replace(/-/g, "")`).

## File layout

- **New:** `src/routes/password-resets.ts`. Export two routers:
  - `adminPasswordResetsRoutes` — the `POST /admin/password-resets` endpoint, admin-only.
  - `passwordResetsRoutes` — the `POST /password-resets/:token/confirm` endpoint, public.
- **Edit:** `schema.sql` (add table) and `src/index.ts` (mount both routers).

## Done when

- Non-admin calling `POST /admin/password-resets` gets 403.
- Unknown email returns 404 with an `AppError` payload.
- Expired or already-used token returns 400 on confirm.
- Successful confirm: password hash updated, `used_at` set on the token row, all rows for that user in `sessions` deleted.
